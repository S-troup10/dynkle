import type { ParsedTransaction } from './chain';

export interface ChargeExpectation {
  recipient: string;
  mint: string;
  amountRaw: bigint;
  /** Unix ms window the transaction's blockTime must fall in. */
  windowStart: number;
  windowEnd: number;
}

export type TransferAssessment =
  | { result: 'paid'; receivedRaw: bigint; excessRaw: bigint }
  | { result: 'wrong_amount'; receivedRaw: bigint; shortfallRaw: bigint }
  | { result: 'failed'; reason: string }
  | { result: 'outside_window' };

/** Net change in `owner`'s balance of `mint` (spec §2.4 step 3). */
export function tokenDelta(tx: ParsedTransaction, owner: string, mint: string): bigint {
  const pre = tx.meta?.preTokenBalances ?? [];
  const post = tx.meta?.postTokenBalances ?? [];
  let delta = 0n;
  for (const p of post) {
    if (p.owner !== owner || p.mint !== mint) continue;
    const before = pre.find((b) => b.accountIndex === p.accountIndex);
    delta += BigInt(p.uiTokenAmount.amount) - BigInt(before?.uiTokenAmount.amount ?? '0');
  }
  return delta;
}

/**
 * Was this transaction a payment of the charge? Only on-chain data counts: the
 * phone's claims (amount, recipient, symbol) are never trusted.
 * Policy while customers type the amount: under -> wrong_amount (show the
 * shortfall), over -> paid with the excess flagged.
 */
export function assessTransfer(tx: ParsedTransaction, charge: ChargeExpectation): TransferAssessment {
  if (!tx.meta) return { result: 'failed', reason: 'Transaction has no status' };
  if (tx.meta.err != null) return { result: 'failed', reason: 'The transaction failed on Solana' };
  if (tx.blockTime != null) {
    const at = tx.blockTime * 1000;
    if (at < charge.windowStart || at > charge.windowEnd) return { result: 'outside_window' };
  }
  const received = tokenDelta(tx, charge.recipient, charge.mint);
  if (received < charge.amountRaw) return { result: 'wrong_amount', receivedRaw: received, shortfallRaw: charge.amountRaw - received };
  return { result: 'paid', receivedRaw: received, excessRaw: received - charge.amountRaw };
}
