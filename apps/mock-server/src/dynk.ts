import {
  BLE_SESSION_MIN_REMAINING_MS,
  FINAL_STATUSES,
  formatTokenAmount,
  type BleSenderMessage,
  type DynkQuote,
  type PaymentSession,
  type PaymentVerification,
} from '@dynkle/shared';
import type { ChainClient, ParsedTransaction } from './solana/chain';
import { issueSession, type IssuedSession } from './solana/session';
import { assessTransfer } from './solana/verify';
import type { MerchantWallet } from './solana/wallet';
import { HttpError, type Store } from './store';

/**
 * Bluetooth Tap to Pay with the DYNK app (integration spec, phase 1).
 *
 * The terminal is the Bluetooth receiver; this service is the Dynkle backend
 * behind it: it quotes each charge in DYNK, issues signed sessions for the
 * terminal to serve, follows the Bluetooth exchange the terminal reports, and
 * decides "Paid" only from the chain, both when the terminal posts the phone's
 * transaction signature and from a watcher (so a lost Bluetooth write never loses
 * a payment).
 */

export interface DynkOptions {
  wallet: MerchantWallet;
  chain: ChainClient;
  /** DYNK mint the customers' app build pays with. */
  mint: string;
  decimals: number;
  /** How long to keep looking for a claimed signature on chain. */
  verifyTimeoutMs?: number;
  verifyPollMs?: number;
  /** How often the chain watcher looks for payments nobody told us about. 0 turns it off. */
  watchIntervalMs?: number;
  /** A payment landing this long after the price lock ended still counts (the customer was mid-payment). */
  latePaymentGraceMs?: number;
}

interface BleState {
  /** Phone that read the session first and is paying (one customer per charge). */
  device?: string;
  processing: boolean;
  sessions: IssuedSession[];
}

const LIVE: PaymentSession['status'][] = ['armed', 'wallet_connected', 'approved', 'confirming'];

export class DynkPayments {
  private ble = new Map<string, BleState>();
  /** Transaction signature -> payment it paid. A signature can only ever pay one charge. */
  private signatures = new Map<string, string>();
  /** Signatures the watcher has finished with. */
  private seen = new Set<string>();
  private verifying = new Set<string>();
  private watchTimer: NodeJS.Timeout | null = null;
  private watching = false;
  private disposed = false;

  constructor(
    private store: Store,
    private opts: DynkOptions,
    private log: { warn: (o: object, m: string) => void; info: (o: object, m: string) => void } = { warn: () => {}, info: () => {} },
  ) {
    store.quoter = (totalCents) => this.quote(totalCents);
    store.merchantWalletAddress = opts.wallet.address;
    for (const p of store.payments.values()) if (p.txSignature && p.dynk) this.signatures.set(p.txSignature, p.id);
    const every = opts.watchIntervalMs ?? 3000;
    if (every > 0) {
      this.watchTimer = setInterval(() => void this.watch(), every);
      this.watchTimer.unref?.();
    }
  }

  get wallet() {
    return this.opts.wallet;
  }
  get mint() {
    return this.opts.mint;
  }
  get decimals() {
    return this.opts.decimals;
  }
  get chain() {
    return this.opts.chain;
  }

  dispose() {
    this.disposed = true;
    if (this.watchTimer) clearInterval(this.watchTimer);
  }

  // ---------- Quotes ----------

  /**
   * A$ total -> DYNK amount the customer must send. Today the customer types it, and
   * there's no on-chain reference yet, so the raw amount is made unique among open
   * charges to the same wallet (one unit of the last decimal at a time): otherwise two
   * tills charging the same price couldn't be told apart.
   */
  quote(totalCents: number): DynkQuote {
    const rate = this.store.settings.dynkPerAud;
    const d = this.opts.decimals;
    // Round to 2 decimal places of DYNK first so the number is easy to read out, then make it unique.
    const cents = BigInt(Math.round((totalCents / 100) * rate * 100));
    let raw = d >= 2 ? cents * 10n ** BigInt(d - 2) : cents / 10n ** BigInt(2 - d);
    const taken = new Set(this.openCharges().map((p) => p.dynk!.amountRaw));
    while (taken.has(raw.toString())) raw += 1n;
    return {
      symbol: 'DYNK',
      mint: this.opts.mint,
      decimals: d,
      amount: formatTokenAmount(raw, d),
      amountRaw: raw.toString(),
      recipient: this.opts.wallet.address,
      rate,
    };
  }

  private openCharges(): PaymentSession[] {
    return [...this.store.payments.values()].filter(
      (p) => p.dynk && p.dynk.recipient === this.opts.wallet.address && p.dynk.mint === this.opts.mint && LIVE.includes(p.status),
    );
  }

  // ---------- Sessions ----------

  private state(paymentId: string): BleState {
    let s = this.ble.get(paymentId);
    if (!s) this.ble.set(paymentId, (s = { processing: false, sessions: [] }));
    return s;
  }

  /** A fresh signed session for the terminal to serve (and on every rotation). */
  session(p: PaymentSession): IssuedSession & { minRemainingMs: number } {
    if (!p.dynk) throw new HttpError(409, 'This charge has no DYNK quote');
    if (p.status !== 'armed' && p.status !== 'wallet_connected') throw new HttpError(409, `Payment is ${p.status}`);
    const st = this.state(p.id);
    if (st.processing) throw new HttpError(409, 'A customer is already paying this charge');
    const issued = issueSession(this.opts.wallet, this.store.profileMerchantName());
    st.sessions = [...st.sessions.slice(-4), issued];
    return { ...issued, minRemainingMs: BLE_SESSION_MIN_REMAINING_MS };
  }

  /** The session the terminal is serving now (for the dev panel's pretend phone). */
  currentSession(paymentId: string): IssuedSession | undefined {
    return this.ble.get(paymentId)?.sessions.at(-1);
  }

  // ---------- Bluetooth exchange, as reported by the terminal ----------

  bleEvent(p: PaymentSession, event: 'read' | 'processing' | 'failed' | 'disconnected', device?: string, message?: BleSenderMessage) {
    const st = this.state(p.id);
    // One customer per charge: once a phone is paying, other phones are ignored.
    if (st.device && device && st.device !== device && st.processing) return p;
    const method = { wallet: 'DYNK app' as const, channel: 'bluetooth' as const };
    switch (event) {
      case 'read':
        st.device = device ?? st.device;
        if (p.status === 'armed') this.store.transition(p, 'wallet_connected', { method, customerWallet: undefined });
        break;
      case 'processing':
        st.device = device ?? st.device;
        st.processing = true;
        if (p.status === 'armed' || p.status === 'wallet_connected') {
          this.store.transition(p, 'approved', { method, customerWallet: shortAddress(message?.senderAddress) });
        }
        break;
      case 'failed':
        if (!FINAL_STATUSES.includes(p.status) && p.status !== 'confirming') {
          this.store.transition(p, 'failed', {
            failureCode: 'wallet_failed',
            failureReason: "The payment didn't go through in the customer's DYNK app. Nothing was charged.",
          });
        }
        break;
      case 'disconnected':
        // The phone walked away before paying: back to waiting for a tap.
        if (!st.processing && p.status === 'wallet_connected') {
          st.device = undefined;
          this.store.transition(p, 'armed', { method: undefined, customerWallet: undefined });
        }
        break;
    }
    return p;
  }

  /** The phone said "confirmed" and gave its transaction signature: check it on chain. */
  claim(p: PaymentSession, txSignature: string): PaymentSession {
    const other = this.signatures.get(txSignature);
    if (other && other !== p.id) throw new HttpError(409, 'That transaction already paid another charge');
    if (p.status === 'paid') return p;
    if (!p.dynk) throw new HttpError(409, 'This charge has no DYNK quote');
    if (['armed', 'wallet_connected', 'approved'].includes(p.status)) {
      this.store.transition(p, 'confirming', { method: p.method ?? { wallet: 'DYNK app', channel: 'bluetooth' } });
    }
    void this.verifyClaim(p, txSignature);
    return p;
  }

  private async verifyClaim(p: PaymentSession, sig: string) {
    if (this.verifying.has(sig)) return;
    this.verifying.add(sig);
    const deadline = Date.now() + (this.opts.verifyTimeoutMs ?? 60_000);
    try {
      while (!this.disposed && Date.now() < deadline) {
        let tx: ParsedTransaction | null = null;
        try {
          tx = await this.opts.chain.getTransaction(sig);
        } catch (err) {
          this.log.warn({ err, sig }, 'chain lookup failed');
        }
        if (tx) {
          this.settle(p, sig, tx, 'bluetooth');
          return;
        }
        if (p.status === 'paid') return; // the watcher got there first
        await new Promise((r) => setTimeout(r, this.opts.verifyPollMs ?? 1500));
      }
      if (!this.disposed && p.status === 'confirming') {
        this.store.transition(p, 'failed', {
          failureCode: 'not_found',
          failureReason:
            "Couldn't find this payment on Solana. If the customer's app says it was sent, check the activity before charging again.",
          verification: this.verification(sig, 'not_found', 'bluetooth'),
        });
      }
    } finally {
      this.verifying.delete(sig);
    }
  }

  // ---------- Chain watcher ----------

  /** Finds payments to the merchant wallet that no Bluetooth write told us about. */
  async watch() {
    if (this.watching || this.disposed) return;
    const candidates = this.watchCandidates();
    if (candidates.length === 0) return;
    this.watching = true;
    try {
      const sigs = await this.opts.chain.recentSignatures(this.opts.wallet.address, this.opts.mint, 25);
      for (const sig of sigs) {
        if (this.seen.has(sig) || this.signatures.has(sig) || this.verifying.has(sig)) continue;
        const tx = await this.opts.chain.getTransaction(sig);
        if (!tx) continue; // not confirmed yet: look again next round
        this.seen.add(sig);
        const match = this.matchCharge(tx);
        if (match) this.settle(match, sig, tx, 'watcher');
      }
    } catch (err) {
      this.log.warn({ err }, 'chain watcher failed');
    } finally {
      this.watching = false;
    }
  }

  /** Open charges, plus ones whose price lock ended moments ago (the customer may have been mid-payment). */
  private watchCandidates(): PaymentSession[] {
    const grace = this.opts.latePaymentGraceMs ?? 120_000;
    return [...this.store.payments.values()].filter(
      (p) =>
        p.dynk &&
        p.dynk.recipient === this.opts.wallet.address &&
        p.dynk.mint === this.opts.mint &&
        (LIVE.includes(p.status) || (p.status === 'expired' && Date.parse(p.expiresAt) + grace > Date.now())),
    );
  }

  /** Which open charge does an incoming transfer belong to? Exact amount first, else the only open charge. */
  private matchCharge(tx: ParsedTransaction): PaymentSession | undefined {
    const candidates = this.watchCandidates().filter((p) => {
      const a = assessTransfer(tx, this.expectation(p));
      return a.result === 'paid' || a.result === 'wrong_amount';
    });
    const received = candidates.length ? assessTransfer(tx, this.expectation(candidates[0])) : null;
    if (!received || received.result === 'failed' || received.result === 'outside_window') return undefined;
    if (received.receivedRaw === 0n) return undefined;
    const exact = candidates.find((p) => BigInt(p.dynk!.amountRaw) === received.receivedRaw);
    if (exact) return exact;
    return candidates.length === 1 ? candidates[0] : undefined;
  }

  private expectation(p: PaymentSession) {
    const grace = this.opts.latePaymentGraceMs ?? 120_000;
    return {
      recipient: p.dynk!.recipient,
      mint: p.dynk!.mint,
      amountRaw: BigInt(p.dynk!.amountRaw),
      // Block times are whole seconds and clocks drift: allow a little slack before creation.
      windowStart: Date.parse(p.createdAt) - 30_000,
      windowEnd: Date.parse(p.expiresAt) + grace,
    };
  }

  // ---------- Outcome ----------

  private verification(
    sig: string,
    result: PaymentVerification['result'],
    via: PaymentVerification['via'],
    extra: Partial<PaymentVerification> = {},
  ) {
    return { txSignature: sig, result, via, checkedAt: new Date().toISOString(), ...extra } satisfies PaymentVerification;
  }

  private settle(p: PaymentSession, sig: string, tx: ParsedTransaction, via: PaymentVerification['via']) {
    if (p.status === 'paid' || p.status === 'cancelled') return;
    const other = this.signatures.get(sig);
    if (other && other !== p.id) return;
    const a = assessTransfer(tx, this.expectation(p));
    const fmt = (raw: bigint) => `${formatTokenAmount(raw, p.dynk!.decimals)} DYNK`;
    const method = p.method ?? { wallet: 'DYNK app' as const, channel: 'bluetooth' as const };
    switch (a.result) {
      case 'paid':
        this.signatures.set(sig, p.id);
        this.store.transition(p, 'paid', {
          txSignature: sig,
          method,
          verification: this.verification(sig, 'paid', via, {
            receivedRaw: a.receivedRaw.toString(),
            ...(a.excessRaw > 0n ? { excessRaw: a.excessRaw.toString() } : {}),
          }),
        });
        this.log.info({ paymentId: p.id, sig, via, excess: a.excessRaw.toString() }, 'DYNK payment verified');
        break;
      case 'wrong_amount':
        this.signatures.set(sig, p.id);
        this.store.transition(p, 'failed', {
          txSignature: sig,
          method,
          failureCode: 'wrong_amount',
          failureReason:
            a.receivedRaw === 0n
              ? `No DYNK arrived. The customer may have sent a different token. ${fmt(BigInt(p.dynk!.amountRaw))} was due.`
              : `Received ${fmt(a.receivedRaw)} of ${fmt(BigInt(p.dynk!.amountRaw))}: ${fmt(a.shortfallRaw)} short.`,
          verification: this.verification(sig, 'wrong_amount', via, {
            receivedRaw: a.receivedRaw.toString(),
            shortfallRaw: a.shortfallRaw.toString(),
          }),
        });
        break;
      case 'failed':
        this.store.transition(p, 'failed', {
          txSignature: sig,
          failureCode: 'transfer_failed',
          failureReason: `${a.reason}. Nothing was charged.`,
          verification: this.verification(sig, 'failed', via),
        });
        break;
      case 'outside_window':
        this.log.warn({ paymentId: p.id, sig }, 'claimed transaction is outside the charge window');
        if (p.status === 'confirming') {
          this.store.transition(p, 'failed', {
            failureCode: 'not_found',
            failureReason: "That transaction isn't from this charge.",
            verification: this.verification(sig, 'not_found', via),
          });
        }
        break;
    }
  }
}

function shortAddress(a?: string) {
  return a && a.length > 8 ? `${a.slice(0, 4)}…${a.slice(-4)}` : undefined;
}
