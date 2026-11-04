import { create } from 'zustand';
import { FINAL_STATUSES, type OrderLine, type PaymentSession, type RemoteCharge } from '@dynkle/shared';
import { api, newRequestId } from '@/api/client';
import { log } from '@/lib/logger';
import { storage } from '@/lib/storage';
import { useCart } from './cart';
import { isLive, shouldApply } from './checkoutLogic';

export interface Draft {
  lines: OrderLine[];
  subtotalCents: number;
  reference?: string;
  source: 'terminal' | 'dashboard';
}

interface CheckoutState {
  draft: Draft | null;
  tipCents: number;
  payment: PaymentSession | null;
  incoming: RemoteCharge | null;
  busy: boolean;
  error: string | null;
  begin: (draft: Draft) => void;
  /** A charge armed by the backend itself (e.g. another counter or the website), not by this terminal. */
  beginRemote: (payment: PaymentSession) => void;
  arm: (tipCents: number) => Promise<PaymentSession | null>;
  rearm: () => Promise<PaymentSession | null>;
  cancel: () => Promise<void>;
  onStatus: (p: PaymentSession) => void;
  receiveIncoming: (c: RemoteCharge) => void;
  acceptIncoming: () => Promise<PaymentSession | null>;
  dismissIncoming: () => Promise<void>;
  /** Sale is over (paid, or cancelled for good). Clears the order when it was rung up here. */
  finish: (clearOrder: boolean) => void;
  /** Ask the dashboard for the current payment's status (after a reconnect, or while offline). */
  refresh: () => Promise<void>;
  /**
   * After a restart: pick up a sale that was still in progress (or that got paid while the
   * app was down). Returns true when there's a payment to show.
   */
  restore: () => Promise<boolean>;
}

/** What's saved so a crash mid-payment doesn't lose track of a sale that may still be paid. */
interface SavedCheckout {
  draft: Draft;
  tipCents: number;
  paymentId: string;
}

const SAVED_KEY = 'dynkle.checkout';

export const useCheckout = create<CheckoutState>((set, get) => ({
  draft: null,
  tipCents: 0,
  payment: null,
  incoming: null,
  busy: false,
  error: null,

  begin: (draft) => set({ draft, tipCents: 0, payment: null, error: null }),

  beginRemote: (payment) =>
    set({
      draft: { lines: payment.lines, subtotalCents: payment.subtotalCents, reference: payment.reference, source: 'dashboard' },
      tipCents: payment.tipCents,
      payment,
      incoming: null,
      busy: false,
      error: null,
    }),

  arm: async (tipCents) => {
    const { draft } = get();
    if (!draft) return null;
    set({ busy: true, error: null, tipCents });
    // One key per charge attempt: the client's retries reuse it, so a reply lost to a
    // timeout can't arm a second charge.
    const key = newRequestId();
    try {
      const payment = await api.createPayment(
        { lines: draft.lines, subtotalCents: draft.subtotalCents, tipCents, reference: draft.reference },
        key,
      );
      set({ payment, busy: false });
      log.info('Charge armed', { paymentId: payment.id, totalCents: payment.totalCents, source: draft.source });
      return payment;
    } catch (e) {
      set({ busy: false, error: (e as Error).message });
      log.warn('Could not arm charge', { error: e });
      return null;
    }
  },

  rearm: async () => {
    const { payment, tipCents } = get();
    if (payment && (payment.status === 'armed' || payment.status === 'wallet_connected')) {
      await api.cancelPayment(payment.id).catch(() => undefined);
    }
    return get().arm(tipCents);
  },

  cancel: async () => {
    const { payment } = get();
    set({ payment: null });
    if (payment) await api.cancelPayment(payment.id).catch(() => undefined);
  },

  onStatus: (p) => {
    const current = get().payment;
    if (!shouldApply(current, p)) return;
    if (current?.status !== p.status) log.info('Payment status', { paymentId: p.id, status: p.status });
    set({ payment: p });
  },

  receiveIncoming: (incoming) => set({ incoming }),

  acceptIncoming: async () => {
    const { incoming } = get();
    if (!incoming) return null;
    set({ busy: true, error: null });
    try {
      const payment = await api.acceptRemoteCharge(incoming.id);
      set({
        incoming: null,
        busy: false,
        payment,
        tipCents: 0,
        draft: { lines: incoming.lines, subtotalCents: incoming.amountCents, reference: incoming.reference, source: 'dashboard' },
      });
      return payment;
    } catch (e) {
      set({ busy: false, error: (e as Error).message, incoming: null });
      return null;
    }
  },

  dismissIncoming: async () => {
    const { incoming } = get();
    set({ incoming: null });
    if (incoming) await api.dismissRemoteCharge(incoming.id).catch(() => undefined);
  },

  finish: (clearOrder) => {
    if (clearOrder) useCart.getState().clear();
    set({ draft: null, payment: null, tipCents: 0, error: null });
  },

  refresh: async () => {
    const { payment } = get();
    if (!payment || !isLive(payment.status)) return;
    try {
      get().onStatus(await api.getPayment(payment.id));
    } catch {
      // Offline: the fallback poll or the next reconnect will try again.
    }
  },

  restore: async () => {
    const saved = await storage.get<SavedCheckout>(SAVED_KEY);
    if (!saved) return false;
    try {
      const payment = await api.getPayment(saved.paymentId);
      // Only bring back sales the merchant still needs to see: live ones, and ones that got paid.
      if (!isLive(payment.status) && payment.status !== 'paid') {
        storage.set(SAVED_KEY, null);
        return false;
      }
      set({ draft: saved.draft, tipCents: saved.tipCents, payment });
      log.info('Restored sale after restart', { paymentId: payment.id, status: payment.status });
      return true;
    } catch (e) {
      log.warn('Could not restore sale after restart', { paymentId: saved.paymentId, error: e });
      // A 404 means the dashboard has no record of it; anything else, keep it for next time.
      if ((e as { status?: number }).status === 404) storage.set(SAVED_KEY, null);
      return false;
    }
  },
}));

// Save the sale in progress whenever it changes; forget it once it's over.
useCheckout.subscribe((state, prev) => {
  if (state.payment === prev.payment && state.draft === prev.draft) return;
  const { payment, draft, tipCents } = state;
  if (!payment || !draft || (FINAL_STATUSES.includes(payment.status) && payment.status !== 'paid')) {
    if (prev.payment) storage.set(SAVED_KEY, null);
    return;
  }
  if (payment.id !== prev.payment?.id || payment.status !== prev.payment?.status) {
    storage.set(SAVED_KEY, { draft, tipCents, paymentId: payment.id } satisfies SavedCheckout);
  }
});
