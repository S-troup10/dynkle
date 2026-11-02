import { useEffect } from 'react';
import { View } from 'react-native';
import { Armed, Confirming, Expired, Failed, Paid, Processing, backToSelling } from '@/components/checkout';
import { Screen } from '@/components/ui';
import { nfc } from '@/native/hardware';
import { useCheckout } from '@/state/checkout';
import { checkoutView, isLive } from '@/state/checkoutLogic';
import { useUi } from '@/state/ui';

export default function Checkout() {
  const payment = useCheckout((s) => s.payment);
  const socket = useUi((s) => s.socket);

  // Fallback polling when the live connection is down.
  useEffect(() => {
    if (!payment || socket === 'open' || !isLive(payment.status)) return;
    const t = setInterval(() => useCheckout.getState().refresh(), 2000);
    return () => clearInterval(t);
  }, [payment, socket]);

  // Serve the payment link over NFC only while the customer can still pay.
  const nfcUri = payment && (payment.status === 'armed' || payment.status === 'wallet_connected') ? payment.ndefUrl : null;
  useEffect(() => {
    nfc.arm(nfcUri);
    return () => nfc.arm(null);
  }, [nfcUri]);

  useEffect(() => {
    if (payment?.status === 'cancelled') backToSelling();
  }, [payment?.status]);

  if (!payment)
    return (
      <Screen>
        <View />
      </Screen>
    );

  switch (checkoutView(payment.status)) {
    case 'armed':
      return <Armed payment={payment} />;
    case 'confirming':
      return <Confirming payment={payment} />;
    case 'processing':
      return <Processing payment={payment} />;
    case 'paid':
      return <Paid payment={payment} />;
    case 'failed':
      return <Failed payment={payment} />;
    case 'expired':
      return <Expired payment={payment} />;
    default:
      return (
        <Screen>
          <View />
        </Screen>
      );
  }
}
