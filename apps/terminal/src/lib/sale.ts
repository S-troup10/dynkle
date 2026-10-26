import { router } from 'expo-router';
import { cartTotal } from '@/state/cartLogic';
import { useCart } from '@/state/cart';
import { useCheckout, type Draft } from '@/state/checkout';
import { useSession } from '@/state/session';

/** Start charging the customer: tip prompt first (if on), then arm. */
export async function startSale(draft: Draft) {
  const checkout = useCheckout.getState();
  checkout.begin(draft);
  const tips = useSession.getState().profile?.settings.tipsEnabled ?? false;
  if (tips && draft.source === 'terminal') {
    router.push('/checkout/tip');
    return;
  }
  const p = await checkout.arm(0);
  if (p) router.push('/checkout');
}

/** Charge whatever is in the current order. */
export function chargeOrder() {
  const { lines } = useCart.getState();
  return startSale({ lines, subtotalCents: cartTotal(lines), source: 'terminal' });
}
