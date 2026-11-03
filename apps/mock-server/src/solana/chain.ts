import { randomBytes } from 'node:crypto';
import bs58 from 'bs58';

/** The parts of a `getParsedTransaction` result that payment checks read (Solana JSON-RPC shape). */
export interface TokenBalance {
  accountIndex: number;
  mint: string;
  owner?: string;
  uiTokenAmount: { amount: string; decimals: number };
}

export interface ParsedTransaction {
  blockTime: number | null;
  slot?: number;
  meta: { err: unknown; preTokenBalances?: TokenBalance[] | null; postTokenBalances?: TokenBalance[] | null } | null;
  transaction?: { signatures: string[] };
}

export interface ChainClient {
  readonly name: string;
  /** null while the transaction isn't visible yet (not found / not confirmed). */
  getTransaction(signature: string): Promise<ParsedTransaction | null>;
  /** Newest-first signatures touching `owner`'s token account(s) for `mint`. */
  recentSignatures(owner: string, mint: string, limit?: number): Promise<string[]>;
  /** Token decimals, read from chain. */
  getDecimals(mint: string): Promise<number | null>;
}

// ---------------------------------------------------------------------------
// In-memory chain for the mock dashboard: the dev panel's pretend DYNK phone
// "submits" transfers here, and verification reads them back in the same shape
// as real Solana RPC, so the same checks run in both.
// ---------------------------------------------------------------------------

export const NATIVE_SOL_MINT = 'So11111111111111111111111111111111111111112';

interface MockTransfer {
  signature: string;
  visibleAt: number;
  tx: ParsedTransaction;
  owners: string[];
  mint: string;
}

export class MockChain implements ChainClient {
  readonly name = 'mock';
  private transfers: MockTransfer[] = [];

  constructor(
    private decimals: Record<string, number> = {},
    /** Delay before a submitted transaction shows up at "confirmed". */
    private confirmDelayMs = 800,
  ) {}

  /**
   * A transfer of `amountRaw` of `mint` to `toOwner`. Native SOL produces no token
   * balance change, like a real SOL transfer. `fail` lands it on chain with an error.
   */
  submitTransfer(input: { from: string; toOwner: string; mint: string; amountRaw: bigint; decimals: number; fail?: boolean }): string {
    const signature = bs58.encode(randomBytes(64));
    const isToken = input.mint !== NATIVE_SOL_MINT;
    const credited = input.fail ? 0n : input.amountRaw;
    const bal = (index: number, owner: string, amount: bigint): TokenBalance => ({
      accountIndex: index,
      mint: input.mint,
      owner,
      uiTokenAmount: { amount: amount.toString(), decimals: input.decimals },
    });
    const tx: ParsedTransaction = {
      blockTime: Math.floor(Date.now() / 1000),
      meta: {
        err: input.fail ? { InstructionError: [0, { Custom: 1 }] } : null,
        preTokenBalances: isToken ? [bal(1, input.from, 10n ** 15n), bal(2, input.toOwner, 0n)] : [],
        postTokenBalances: isToken ? [bal(1, input.from, 10n ** 15n - credited), bal(2, input.toOwner, credited)] : [],
      },
      transaction: { signatures: [signature] },
    };
    this.transfers.push({
      signature,
      visibleAt: Date.now() + this.confirmDelayMs,
      tx,
      owners: [input.from, input.toOwner],
      mint: input.mint,
    });
    return signature;
  }

  async getTransaction(signature: string) {
    const t = this.transfers.find((x) => x.signature === signature);
    return t && t.visibleAt <= Date.now() ? t.tx : null;
  }

  async recentSignatures(owner: string, mint: string, limit = 20) {
    return this.transfers
      .filter((t) => t.visibleAt <= Date.now() && t.mint === mint && t.owners.includes(owner))
      .map((t) => t.signature)
      .reverse()
      .slice(0, limit);
  }

  async getDecimals(mint: string) {
    return this.decimals[mint] ?? null;
  }
}

// ---------------------------------------------------------------------------
// Real Solana over JSON-RPC (SOLANA_RPC_URL, e.g. a Helius endpoint).
// ---------------------------------------------------------------------------

export class SolanaRpcChain implements ChainClient {
  readonly name = 'solana-rpc';
  private tokenAccounts = new Map<string, { at: number; accounts: string[] }>();

  constructor(
    private url: string,
    private fetchImpl: typeof fetch = fetch,
    private timeoutMs = 10_000,
  ) {}

  private async rpc<T>(method: string, params: unknown[]): Promise<T> {
    const res = await this.fetchImpl(this.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new Error(`Solana RPC ${method} failed: HTTP ${res.status}`);
    const body = (await res.json()) as { result?: T; error?: { message: string } };
    if (body.error) throw new Error(`Solana RPC ${method}: ${body.error.message}`);
    return body.result as T;
  }

  getTransaction(signature: string) {
    return this.rpc<ParsedTransaction | null>('getTransaction', [
      signature,
      { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 },
    ]);
  }

  /** The merchant's token accounts for the mint (normally just the associated one). Cached for a minute. */
  private async accountsFor(owner: string, mint: string): Promise<string[]> {
    const key = `${owner}:${mint}`;
    const cached = this.tokenAccounts.get(key);
    if (cached && cached.at > Date.now() - 60_000) return cached.accounts;
    const result = await this.rpc<{ value: { pubkey: string }[] }>('getTokenAccountsByOwner', [
      owner,
      { mint },
      { encoding: 'jsonParsed', commitment: 'confirmed' },
    ]);
    const accounts = result.value.map((v) => v.pubkey);
    this.tokenAccounts.set(key, { at: Date.now(), accounts });
    return accounts;
  }

  async recentSignatures(owner: string, mint: string, limit = 20) {
    const out: string[] = [];
    for (const account of await this.accountsFor(owner, mint)) {
      const sigs = await this.rpc<{ signature: string; err: unknown }[]>('getSignaturesForAddress', [
        account,
        { limit, commitment: 'confirmed' },
      ]);
      out.push(...sigs.map((s) => s.signature));
    }
    return out;
  }

  async getDecimals(mint: string) {
    const r = await this.rpc<{ value: { decimals: number } }>('getTokenSupply', [mint]);
    return r.value.decimals;
  }
}
