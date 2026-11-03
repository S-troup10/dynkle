import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import type { BleSessionV2, PaymentSession, ServerEvent, TerminalProfile } from '@dynkle/shared';
import { DEFAULT_DYNK_MINT, buildServer } from './server';
import { MockChain, NATIVE_SOL_MINT, SolanaRpcChain } from './solana/chain';
import { assessTransfer, tokenDelta } from './solana/verify';
import { addressOnlyWallet, generateWallet } from './solana/wallet';

type Built = Awaited<ReturnType<typeof buildServer>>;
let built: Built | null = null;
let chain: MockChain;
const MINT = DEFAULT_DYNK_MINT;

afterEach(async () => {
  await built?.app.close();
  built = null;
});

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function start(extra: Parameters<typeof buildServer>[0] = {}) {
  chain = new MockChain({ [MINT]: 6 }, 20);
  built = await buildServer({
    seedActivity: false,
    dynk: { chain, watchIntervalMs: 40, verifyPollMs: 15, verifyTimeoutMs: 400, ...extra.dynk },
    ...extra,
  });
  return built;
}

async function call<T = unknown>(method: string, url: string, body?: unknown, token?: string) {
  const res = await built!.app.inject({
    method: method as 'GET',
    url,
    payload: body as object,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  return { status: res.statusCode, json: res.json() as T };
}

async function pair(name = 'Till 1'): Promise<string> {
  const { code } = (await call<{ code: string }>('POST', '/pairing/codes')).json;
  await call('POST', '/pairing/claim', { code, tillName: name });
  return (await call<{ token: string }>('GET', `/pairing/codes/${code}`)).json.token;
}

const charge = async (token: string, subtotalCents = 2100, tipCents = 315) =>
  (await call<PaymentSession>('POST', '/payments', { lines: [], subtotalCents, tipCents }, token)).json;
const get = async (token: string, id: string) => (await call<PaymentSession>('GET', `/payments/${id}`, undefined, token)).json;
async function until(token: string, id: string, status: PaymentSession['status'], ms = 1500) {
  const end = Date.now() + ms;
  for (;;) {
    const p = await get(token, id);
    if (p.status === status || Date.now() > end) return p;
    await wait(15);
  }
}
const pay = (p: PaymentSession, amountRaw: bigint, mint = MINT) =>
  chain.submitTransfer({ from: 'Customer1111', toOwner: p.dynk!.recipient, mint, amountRaw, decimals: 6 });

describe('DYNK quotes', () => {
  it('quotes each charge in DYNK at the dashboard rate', async () => {
    await start();
    const token = await pair();
    const p = await charge(token); // A$24.15 x 43.218 = 1043.71 DYNK
    expect(p.dynk).toMatchObject({ symbol: 'DYNK', mint: MINT, decimals: 6, amount: '1043.71', amountRaw: '1043710000' });
    const me = (await call<TerminalProfile>('GET', '/terminal/me', undefined, token)).json;
    expect(p.dynk!.recipient).toBe(me.merchant.walletAddress);
  });

  it('keeps the raw amount unique among open charges to the same wallet', async () => {
    await start();
    const a = await charge(await pair('A'));
    const b = await charge(await pair('B'));
    expect(b.dynk!.amountRaw).toBe((BigInt(a.dynk!.amountRaw) + 1n).toString());
    expect(b.dynk!.amount).toBe('1043.710001');
  });
});

describe('Bluetooth sessions', () => {
  it('serves a signed v2 session the DYNK app verifies', async () => {
    await start();
    const token = await pair();
    const p = await charge(token);
    const { json } = await call<{ session: BleSessionV2; wire: string }>('POST', `/payments/${p.id}/ble-session`, undefined, token);
    const s = json.session;
    expect(JSON.parse(json.wire)).toEqual(s);
    expect(new TextEncoder().encode(json.wire).length).toBeLessThanOrEqual(480);
    expect(s.v).toBe(2);
    expect(s.n).toMatch(/^[0-9a-f-]{36}$/);
    expect(s.e - Date.now()).toBeGreaterThan(55_000);
    expect(s.d).toBe('Dynkle Café');
    expect(s.a.SOL).toBe(p.dynk!.recipient);
    // Exactly the app's check: ed25519 over the raw UTF-8 nonce.
    expect(nacl.sign.detached.verify(new TextEncoder().encode(s.n), bs58.decode(s.s!), bs58.decode(s.a.SOL))).toBe(true);
    const again = (await call<{ session: BleSessionV2 }>('POST', `/payments/${p.id}/ble-session`, undefined, token)).json.session;
    expect(again.n).not.toBe(s.n);
  });

  it('serves unsigned sessions when only the address is known', async () => {
    await start({ dynk: { wallet: addressOnlyWallet(generateWallet().address) } });
    const token = await pair();
    const p = await charge(token);
    const { json } = await call<{ session: BleSessionV2 }>('POST', `/payments/${p.id}/ble-session`, undefined, token);
    expect(json.session.s).toBeUndefined();
  });

  it("won't serve a session for another till's charge or a finished one", async () => {
    await start();
    const a = await pair('A');
    const b = await pair('B');
    const p = await charge(a);
    expect((await call('POST', `/payments/${p.id}/ble-session`, undefined, b)).status).toBe(404);
    await call('POST', `/payments/${p.id}/cancel`, undefined, a);
    expect((await call('POST', `/payments/${p.id}/ble-session`, undefined, a)).status).toBe(409);
  });
});

describe('Bluetooth payment', () => {
  it('walks read -> processing -> confirmed and verifies on chain', async () => {
    await start();
    const token = await pair();
    const p = await charge(token);
    await call('POST', `/payments/${p.id}/ble-event`, { event: 'read', device: 'AA' }, token);
    expect((await get(token, p.id)).status).toBe('wallet_connected');
    expect((await get(token, p.id)).method).toEqual({ wallet: 'DYNK app', channel: 'bluetooth' });
    await call(
      'POST',
      `/payments/${p.id}/ble-event`,
      { event: 'processing', device: 'AA', message: { transferStatus: 'processing' } },
      token,
    );
    expect((await get(token, p.id)).status).toBe('approved');
    const sig = pay(p, 1043710000n);
    const claimed = await call<PaymentSession>('POST', `/payments/${p.id}/claim-signature`, { txSignature: sig }, token);
    expect(claimed.json.status).toBe('confirming');
    const paid = await until(token, p.id, 'paid');
    expect(paid.status).toBe('paid');
    expect(paid.txSignature).toBe(sig);
    expect(paid.verification).toMatchObject({ result: 'paid', via: 'bluetooth', receivedRaw: '1043710000' });
    expect(paid.verification!.excessRaw).toBeUndefined();
  });

  it('flags an underpayment with the shortfall instead of marking it paid', async () => {
    await start();
    const token = await pair();
    const p = await charge(token);
    const sig = pay(p, 1000000000n);
    await call('POST', `/payments/${p.id}/claim-signature`, { txSignature: sig }, token);
    const out = await until(token, p.id, 'failed');
    expect(out.failureCode).toBe('wrong_amount');
    expect(out.verification).toMatchObject({ result: 'wrong_amount', shortfallRaw: '43710000' });
    expect(out.failureReason).toContain('43.71 DYNK short');
  });

  it('accepts an overpayment and flags the excess', async () => {
    await start();
    const token = await pair();
    const p = await charge(token);
    await call('POST', `/payments/${p.id}/claim-signature`, { txSignature: pay(p, 1050000000n) }, token);
    const out = await until(token, p.id, 'paid');
    expect(out.verification!.excessRaw).toBe('6290000');
  });

  it('does not count a different token (SOL instead of DYNK)', async () => {
    await start();
    const token = await pair();
    const p = await charge(token);
    await call('POST', `/payments/${p.id}/claim-signature`, { txSignature: pay(p, 1043710000n, NATIVE_SOL_MINT) }, token);
    const out = await until(token, p.id, 'failed');
    expect(out.failureCode).toBe('wrong_amount');
    expect(out.failureReason).toContain('No DYNK arrived');
  });

  it('marks a transaction that failed on chain as failed', async () => {
    await start();
    const token = await pair();
    const p = await charge(token);
    const sig = chain.submitTransfer({
      from: 'X',
      toOwner: p.dynk!.recipient,
      mint: MINT,
      amountRaw: 1043710000n,
      decimals: 6,
      fail: true,
    });
    await call('POST', `/payments/${p.id}/claim-signature`, { txSignature: sig }, token);
    expect((await until(token, p.id, 'failed')).failureCode).toBe('transfer_failed');
  });

  it('gives up on a signature that never shows up', async () => {
    await start();
    const token = await pair();
    const p = await charge(token);
    await call('POST', `/payments/${p.id}/claim-signature`, { txSignature: '1'.repeat(64) }, token);
    expect((await until(token, p.id, 'failed')).failureCode).toBe('not_found');
  });

  it('finds the payment with the chain watcher when the confirmed write is lost', async () => {
    await start();
    const token = await pair();
    const p = await charge(token);
    await call('POST', `/payments/${p.id}/ble-event`, { event: 'processing', device: 'AA' }, token);
    pay(p, 1043710000n);
    const out = await until(token, p.id, 'paid');
    expect(out.status).toBe('paid');
    expect(out.verification!.via).toBe('watcher');
  });

  it('matches watched payments to the right till by their unique amount', async () => {
    await start();
    const a = await pair('A');
    const b = await pair('B');
    const pa = await charge(a);
    const pb = await charge(b);
    pay(pb, BigInt(pb.dynk!.amountRaw));
    expect((await until(b, pb.id, 'paid')).status).toBe('paid');
    expect((await get(a, pa.id)).status).toBe('armed');
  });

  it("won't let one transaction pay two charges", async () => {
    await start();
    const token = await pair();
    const p = await charge(token);
    const sig = pay(p, 1043710000n);
    await call('POST', `/payments/${p.id}/claim-signature`, { txSignature: sig }, token);
    await until(token, p.id, 'paid');
    const next = await charge(token);
    expect((await call('POST', `/payments/${next.id}/claim-signature`, { txSignature: sig }, token)).status).toBe(409);
  });

  it('goes back to waiting when the phone walks away before paying', async () => {
    await start();
    const token = await pair();
    const p = await charge(token);
    await call('POST', `/payments/${p.id}/ble-event`, { event: 'read', device: 'AA' }, token);
    await call('POST', `/payments/${p.id}/ble-event`, { event: 'disconnected', device: 'AA' }, token);
    const back = await get(token, p.id);
    expect(back.status).toBe('armed');
    expect(back.method).toBeUndefined();
  });

  it('serves one customer per charge', async () => {
    await start();
    const token = await pair();
    const p = await charge(token);
    await call('POST', `/payments/${p.id}/ble-event`, { event: 'processing', device: 'AA' }, token);
    await call('POST', `/payments/${p.id}/ble-event`, { event: 'failed', device: 'BB' }, token);
    expect((await get(token, p.id)).status).toBe('approved');
    expect((await call('POST', `/payments/${p.id}/ble-session`, undefined, token)).status).toBe(409);
  });

  it("keeps the charge's failure when the customer's app reports failed", async () => {
    await start();
    const token = await pair();
    const p = await charge(token);
    await call('POST', `/payments/${p.id}/ble-event`, { event: 'failed', device: 'AA' }, token);
    expect((await get(token, p.id)).failureCode).toBe('wallet_failed');
  });
});

describe('pretend DYNK phone (dev panel)', () => {
  it('drives the terminal over its live connection like a real phone', async () => {
    await start();
    const token = await pair();
    await built!.app.listen({ port: 0, host: '127.0.0.1' });
    const { port } = built!.app.server.address() as { port: number };
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${token}`);
    const events: ServerEvent[] = [];
    ws.on('message', (m) => events.push(JSON.parse(String(m))));
    await new Promise((r) => ws.once('open', r));

    const p = await charge(token);
    expect((await call('POST', `/dev/payments/${p.id}/ble-tap`, {})).status).toBe(409); // terminal not serving yet
    await call('POST', `/payments/${p.id}/ble-session`, undefined, token);
    expect((await call('POST', `/dev/payments/${p.id}/ble-tap`, {})).status).toBe(200);
    await wait(1000);
    const ble = events.filter((e): e is Extract<ServerEvent, { type: 'dev.ble' }> => e.type === 'dev.ble');
    expect(ble.map((e) => e.action)).toEqual(['read', 'write', 'write', 'disconnect']);
    const confirmed = JSON.parse((ble[2] as { text: string }).text);
    expect(confirmed).toMatchObject({
      transferStatus: 'confirmed',
      amount: '1043.71',
      symbol: 'DYNK',
      recipientAddress: p.dynk!.recipient,
    });
    // No terminal is relaying the writes here, so it's the chain watcher that finds the payment.
    expect((await until(token, p.id, 'paid')).status).toBe('paid');
    ws.close();
  });

  it('refuses to reuse a session, like the app', async () => {
    await start();
    const token = await pair();
    const p = await charge(token);
    await call('POST', `/payments/${p.id}/ble-session`, undefined, token);
    await call('POST', `/dev/payments/${p.id}/ble-tap`, { fail: true });
    const again = await call<{ error: string }>('POST', `/dev/payments/${p.id}/ble-tap`, {});
    expect(again.status).toBe(409);
    expect(again.json.error).toContain('already used');
  });
});

describe('chain checks', () => {
  it('measures the token balance change for the recipient only', () => {
    const tx = {
      blockTime: 1,
      meta: {
        err: null,
        preTokenBalances: [{ accountIndex: 1, mint: MINT, owner: 'C', uiTokenAmount: { amount: '900', decimals: 6 } }],
        postTokenBalances: [
          { accountIndex: 1, mint: MINT, owner: 'C', uiTokenAmount: { amount: '400', decimals: 6 } },
          { accountIndex: 2, mint: MINT, owner: 'M', uiTokenAmount: { amount: '500', decimals: 6 } }, // new account: no pre entry
        ],
      },
    };
    expect(tokenDelta(tx, 'M', MINT)).toBe(500n);
    expect(tokenDelta(tx, 'M', 'other')).toBe(0n);
    expect(assessTransfer(tx, { recipient: 'M', mint: MINT, amountRaw: 500n, windowStart: 0, windowEnd: 5000 }).result).toBe('paid');
    expect(assessTransfer(tx, { recipient: 'M', mint: MINT, amountRaw: 500n, windowStart: 9000, windowEnd: 10000 }).result).toBe(
      'outside_window',
    );
  });

  it('talks Solana JSON-RPC', async () => {
    const calls: { method: string; params: unknown[] }[] = [];
    const results: Record<string, unknown> = {
      getTransaction: { blockTime: 1, meta: { err: null } },
      getTokenAccountsByOwner: { value: [{ pubkey: 'TokAcc1' }] },
      getSignaturesForAddress: [{ signature: 'sigA', err: null }],
      getTokenSupply: { value: { decimals: 9 } },
    };
    const fake = (async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      calls.push(body);
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: results[body.method] }));
    }) as typeof fetch;
    const rpc = new SolanaRpcChain('https://rpc.example', fake);
    expect(await rpc.getTransaction('sig1')).toMatchObject({ meta: { err: null } });
    expect(calls[0].params[1]).toMatchObject({ encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
    expect(await rpc.recentSignatures('Owner', MINT)).toEqual(['sigA']);
    expect(calls[2]).toMatchObject({ method: 'getSignaturesForAddress', params: ['TokAcc1', { limit: 20, commitment: 'confirmed' }] });
    expect(await rpc.getDecimals(MINT)).toBe(9);
  });
});
