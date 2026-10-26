import { create } from 'zustand';
import type { OrderLine, PaymentSession, RemoteCharge } from '@dynkle/shared';
import { api } from '@/api/client';
import { useCart } from './cart';
import { shouldApply } from './checkoutLogic';

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
  arm: (tipCents: number) => Promise<PaymentSession | null>;
  rearm: () => Promise<PaymentSession | null>;
  cancel: () => Promise<void>;
  onStatus: (p: PaymentSession) => void;
  receiveIncoming: (c: RemoteCharge) => void;
  acceptIncoming: () => Promise<PaymentSession | null>;
  dismissIncoming: () => Promise<void>;
  /** Sale is over (paid, or cancelled for good). Clears the order when it was rung up here. */
  finish: (clearOrder: boolean) => void;
}

export const useCheckout = create<CheckoutState>((set, get) => ({
  draft: null,
  tipCents: 0,
  payment: null,
  incoming: null,
  busy: false,
  error: null,

  begin: (draft) => set({ draft, tipCents: 0, payment: null, error: null }),

  arm: async (tipCents) => {
    const { draft } = get();
    if (!draft) return null;
    set({ busy: true, error: null, tipCents });
    try {
      const payment = await api.createPayment({
        lines: draft.lines,
        subtotalCents: draft.subtotalCents,
        tipCents,
        reference: draft.reference,
      });
      set({ payment, busy: false });
      return payment;
    } catch (e) {
      set({ busy: false, error: (e as Error).message });
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
    if (shouldApply(get().payment, p)) set({ payment: p });
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
}));
