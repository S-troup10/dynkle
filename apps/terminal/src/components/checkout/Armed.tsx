import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { formatMoney, type PaymentSession } from '@dynkle/shared';
import { MerchantHeader } from '@/components/Header';
import { Icon } from '@/components/Icon';
import { Banner, MethodChips, PriceLock, QRCard } from '@/components/Payment';
import { Button, Screen, T } from '@/components/ui';
import { useCountdown } from '@/hooks/useCountdown';
import { bluetooth, nfc } from '@/native/hardware';
import { useCheckout } from '@/state/checkout';
import { useSession } from '@/state/session';
import { colors } from '@/theme';
import { backToSelling } from './actions';
import { s } from './styles';

// ---------- 16 / 18 / 31: Armed ----------

export function Armed({ payment }: { payment: PaymentSession }) {
  const lockSeconds = useSession((s) => s.profile?.settings.priceLockSeconds) ?? 90;
  const left = useCountdown(payment.expiresAt);
  const [tapState, setTapState] = useState(nfc.state());
  const btState = bluetooth.state();

  useEffect(() => {
    const t = setInterval(() => setTapState(nfc.state()), 2000);
    return () => clearInterval(t);
  }, []);

  const tapOk = tapState === 'ready';
  const fromDashboard = payment.source === 'dashboard';

  return (
    <Screen glow="center">
      <MerchantHeader
        tillDot={false}
        right={
          <View style={s.armed}>
            <View style={s.armedDot} />
            <Text style={s.armedText}>Armed</Text>
          </View>
        }
      />
      <View style={s.armedBody}>
        {!tapOk ? (
          <Banner icon="warning" tone="amber" title="Tap isn't working right now" body="Customers can still scan or connect with DYNK." />
        ) : null}
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
        <QRCard value={payment.qrUrl} size={190} />
        <T style={s.caption}>Tap your phone on the terminal, connect with DYNK, or scan with any Solana wallet.</T>
        <MethodChips tap={tapOk ? 'ready' : 'unavailable'} connect={btState === 'ready' ? 'ready' : 'unavailable'} scan="ready" />
      </View>
      <View style={{ paddingHorizontal: 20, paddingBottom: 20, gap: 14 }}>
        <PriceLock secondsLeft={left} totalSeconds={lockSeconds} />
        <Button
          title="Cancel charge"
          kind="secondary"
          testID="cancel-charge"
          onPress={async () => {
            await useCheckout.getState().cancel();
            if (fromDashboard) useCheckout.getState().finish(false);
            backToSelling();
          }}
        />
      </View>
    </Screen>
  );
}
