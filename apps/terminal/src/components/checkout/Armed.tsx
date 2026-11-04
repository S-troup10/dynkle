import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { formatMoney, type PaymentSession } from '@dynkle/shared';
import { Icon } from '@/components/Icon';
import { QRCard } from '@/components/Payment';
import { IconButton, Pulse, Screen, T } from '@/components/ui';
import { nfc } from '@/native/hardware';
import { useCheckout } from '@/state/checkout';
import { useUi } from '@/state/ui';
import { colors, cs } from '@/theme';
import { backToSelling } from './actions';
import { s } from './styles';

// ---------- 16 / 18 / 31: Armed ----------
// Kept deliberately minimal for the FP9840's small screen: one amount, one QR
// code (ringed when NFC tap is actually available), one way out.

export function Armed({ payment }: { payment: PaymentSession }) {
  const [tapState, setTapState] = useState(nfc.state());
  const bleState = useUi((u) => u.tapToPay);

  useEffect(() => {
    const t = setInterval(() => setTapState(nfc.state()), 2000);
    return () => clearInterval(t);
  }, []);

  const tapOk = tapState === 'ready';
  const fromDashboard = payment.source === 'dashboard';
  const bleNote =
    bleState === 'unavailable'
      ? 'Bluetooth unavailable'
      : bleState === 'starting'
        ? 'Starting Bluetooth…'
        : bleState === 'busy'
          ? 'Bluetooth: paying'
          : bleState === 'waiting'
            ? 'Bluetooth ready'
            : null;

  const cancel = async () => {
    await useCheckout.getState().cancel();
    if (fromDashboard) useCheckout.getState().finish(false);
    backToSelling();
  };

  return (
    <Screen glow="center">
      <View style={s.armedTop}>
        <IconButton name="close" label="Cancel charge" size={36} testID="cancel-charge" onPress={cancel} />
      </View>
      <View style={s.armedBody}>
        {fromDashboard ? (
          <View style={s.dashPill}>
            <Icon name="monitor" size={16} color={colors.orange} strokeWidth={2} />
            <Text style={s.dashPillText}>Sent from dashboard{payment.reference ? ` · ${payment.reference}` : ''}</Text>
          </View>
        ) : null}
        <View style={{ alignItems: 'center' }}>
          <Text style={s.armedAmount} testID="armed-amount" adjustsFontSizeToFit numberOfLines={1}>
            {formatMoney(payment.totalCents)}
          </Text>
          {payment.tipCents > 0 ? <T>Includes {formatMoney(payment.tipCents)} tip</T> : null}
        </View>
        {tapOk ? (
          <Pulse style={s.nfcRing}>
            <QRCard value={payment.qrUrl} size={cs(190, 260)} />
          </Pulse>
        ) : (
          <QRCard value={payment.qrUrl} size={cs(190, 260)} />
        )}
        <T style={s.caption}>Scan with any Solana wallet, or connect with the DYNK app.</T>
        {bleNote ? (
          <T style={[s.caption, { color: bleState === 'unavailable' ? colors.red : colors.muted, fontSize: 12 }]}>{bleNote}</T>
        ) : null}
      </View>
    </Screen>
  );
}
