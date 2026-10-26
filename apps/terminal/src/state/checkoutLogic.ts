import type { PaymentSession, PaymentStatus } from '@dynkle/shared';

export type CheckoutView = 'armed' | 'confirming' | 'processing' | 'paid' | 'failed' | 'expired' | 'cancelled';

export function checkoutView(status: PaymentStatus): CheckoutView {
  switch (status) {
    case 'armed':
      return 'armed';
    case 'wallet_connected':
      return 'confirming';
    case 'approved':
    case 'confirming':
      return 'processing';
    default:
      return status;
  }
}

/** Steps on the confirming/processing screens: done, active, or still to come. */
export type StepState = 'done' | 'active' | 'todo';

export function confirmationSteps(status: PaymentStatus): { label: string; state: StepState }[] {
  const approved = status === 'approved' || status === 'confirming' || status === 'paid';
  return [
    { label: 'Wallet connected', state: 'done' },
    approved
      ? { label: 'Customer approved', state: 'done' }
      : { label: 'Waiting for customer to approve', state: 'active' },
    { label: 'Confirming on Solana', state: status === 'paid' ? 'done' : approved ? 'active' : 'todo' },
  ];
}

/** Ignore stale or out-of-order status pushes for a payment we've already moved past. */
const ORDER: PaymentStatus[] = ['armed', 'wallet_connected', 'approved', 'confirming', 'paid', 'failed', 'expired', 'cancelled'];

export function shouldApply(current: PaymentSession | null, incoming: PaymentSession): boolean {
  if (!current || current.id !== incoming.id) return false;
  return ORDER.indexOf(incoming.status) >= ORDER.indexOf(current.status);
}
