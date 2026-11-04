import { useEffect } from 'react';
import { View } from 'react-native';
import { Armed, Confirming, Expired, Failed, Paid, Processing, backToSelling } from '@/components/checkout';
import { Spinner } from '@/components/Spinner';
import { FadeInUp, Halo, Pulse, Screen, T } from '@/components/ui';
import { startBleReceive } from '@/lib/bleReceive';
import { nfc } from '@/native/hardware';
import { usePrefs } from '@/state/prefs';
import { useCheckout } from '@/state/checkout';
import { checkoutView, isLive } from '@/state/checkoutLogic';
import { useSession } from '@/state/session';
import { useUi } from '@/state/ui';
import { colors } from '@/theme';

export default function Checkout() {
  const payment = useCheckout((s) => s.payment);
  const busy = useCheckout((s) => s.busy);
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

  // DYNK app Tap to Pay over Bluetooth: runs from arming until the charge is over. It keeps going after
  // the phone says "processing" (advertising stops) so the phone's "confirmed" write still arrives.
  const bleCharge = payment && isLive(payment.status) ? payment.id : null;
  useEffect(() => {
    if (!bleCharge) return;
    const displayName = useSession.getState().profile?.merchant.name ?? 'Dynkle';
    return startBleReceive(bleCharge, displayName, { txPower: usePrefs.getState().bleTxPower });
  }, [bleCharge]);

  useEffect(() => {
    if (payment?.status === 'cancelled') backToSelling();
  }, [payment?.status]);

  if (!payment)
    return (
      <Screen glow="center">
        {/* Navigating here happens the instant the merchant taps a tip, before the
            charge has actually been created on the backend — show that it's working
            rather than sitting on a blank screen for the round trip. */}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 }}>
          {busy ? (
            <>
              <Pulse>
                <Halo color={colors.orangeGlow} size={140}>
                  <Spinner size={72} stroke={5} />
                </Halo>
              </Pulse>
              <T v="eyebrow">Arming charge…</T>
            </>
          ) : null}
        </View>
      </Screen>
    );

  const view = checkoutView(payment.status);
  const screen = (() => {
    switch (view) {
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
        return null;
    }
  })();
  if (!screen)
    return (
      <Screen>
        <View />
      </Screen>
    );
  // Each checkout state fades/lifts in as its own screen, instead of snapping to the next one.
  return (
    <FadeInUp replayKey={view} style={{ flex: 1 }} distance={10}>
      {screen}
    </FadeInUp>
  );
}
