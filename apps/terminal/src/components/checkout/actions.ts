import { router } from 'expo-router';
import { useCheckout } from '@/state/checkout';

export function backToSelling() {
  if (router.canDismiss()) router.dismissTo('/keypad');
  else router.replace('/keypad');
}

/** Ends the sale. Orders rung up here are cleared; a dashboard charge leaves the keyed entry alone. */
export function endSale() {
  const { draft } = useCheckout.getState();
  useCheckout.getState().finish(draft?.source !== 'dashboard');
  backToSelling();
}
