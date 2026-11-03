import { randomBytes } from 'node:crypto';
import { parseTokenAmount, type BleSessionV2, type PaymentSession, type ServerEvent } from '@dynkle/shared';
import type { DynkPayments } from './dynk';
import { MockChain, NATIVE_SOL_MINT } from './solana/chain';
import { verifyNonceSignature } from './solana/wallet';
import { HttpError } from './store';

export interface PhoneTapInput {
  amount?: string;
  token?: 'DYNK' | 'SOL';
  dropConfirmedWrite?: boolean;
  fail?: boolean;
}

/**
 * The dev panel's pretend DYNK app ("Tap to Pay" sender, spec §1.5). It reads the
 * session the terminal is serving, checks it the way the app does, "pays" on the
 * mock chain, and drives the terminal's simulated Bluetooth peripheral with the
 * same reads and writes a real phone would make.
 */
export class PretendPhone {
  /** The app remembers every session id it has used, for its lifetime. */
  private usedSessions = new Set<string>();
  private timers = new Set<NodeJS.Timeout>();

  constructor(
    private dynk: DynkPayments,
    private send: (tillId: string, event: ServerEvent) => void,
  ) {}

  dispose() {
    for (const t of this.timers) clearTimeout(t);
  }

  private at(ms: number, fn: () => void) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
  }

  tap(p: PaymentSession, input: PhoneTapInput) {
    if (!(this.dynk.chain instanceof MockChain))
      throw new HttpError(409, 'The pretend phone only works with the mock chain (SOLANA_RPC_URL is set)');
    if (!p.dynk) throw new HttpError(409, 'This charge has no DYNK quote');
    if (p.status !== 'armed') throw new HttpError(409, `Payment is ${p.status}`);
    const issued = this.dynk.currentSession(p.id);
    if (!issued) throw new HttpError(409, "The terminal isn't serving a Bluetooth session for this charge (is Bluetooth on?)");

    // ---- What the app checks after reading the session (bleSessionParser / bleSignatureVerify) ----
    const session = JSON.parse(issued.wire) as BleSessionV2;
    if (session.v !== 2) throw new HttpError(409, 'Phone: unsupported session version');
    if (session.e < Date.now()) throw new HttpError(409, 'Phone: the session has expired');
    if (this.usedSessions.has(session.n)) throw new HttpError(409, 'Phone: this session was already used');
    if (session.s && !verifyNonceSignature(session.n, session.s, session.a.SOL)) {
      throw new HttpError(409, "Phone: could not verify the receiver's identity. Nothing was sent.");
    }
    this.usedSessions.add(session.n);

    const token = input.token ?? 'DYNK';
    const amount = input.amount ?? p.dynk.amount;
    const decimals = token === 'DYNK' ? p.dynk.decimals : 9;
    const amountRaw = parseTokenAmount(amount, decimals);
    if (amountRaw == null || amountRaw <= 0n) throw new HttpError(400, 'amount: not a positive number');

    const device = Array.from(randomBytes(6), (b) => b.toString(16).padStart(2, '0').toUpperCase()).join(':');
    const sender = 'DYNKcust' + randomBytes(4).toString('hex');
    const write = (status: 'processing' | 'confirmed' | 'failed', txSignature?: string) =>
      this.send(p.tillId, {
        type: 'dev.ble',
        action: 'write',
        device,
        text: JSON.stringify({
          transferStatus: status,
          ...(txSignature ? { txSignature } : {}),
          amount,
          symbol: token,
          chainId: 'solana-mainnet',
          recipientAddress: session.a.SOL,
          senderAddress: sender,
          fiatAmount: (p.totalCents / 100).toFixed(2),
          currencyCode: 'AUD',
          networkFee: '~$0.01',
          networkFeeSymbol: '',
        }),
      });

    this.send(p.tillId, { type: 'dev.ble', action: 'read', device });
    this.at(300, () => write('processing'));
    this.at(700, () => {
      if (input.fail) {
        write('failed');
        this.at(100, () => this.send(p.tillId, { type: 'dev.ble', action: 'disconnect', device }));
        return;
      }
      const chain = this.dynk.chain as MockChain;
      const sig = chain.submitTransfer({
        from: sender,
        toOwner: session.a.SOL,
        mint: token === 'DYNK' ? this.dynk.mint : NATIVE_SOL_MINT,
        amountRaw,
        decimals,
      });
      if (!input.dropConfirmedWrite) write('confirmed', sig);
      this.at(150, () => this.send(p.tillId, { type: 'dev.ble', action: 'disconnect', device }));
    });
    return { device, sessionId: session.n, amount, token };
  }
}
