import { useEffect } from 'react';
import { AccessibilityInfo, Text, View } from 'react-native';
import { formatMoney, type PaymentSession } from '@dynkle/shared';
import { MerchantHeader } from '@/components/Header';
import { Icon } from '@/components/Icon';
import { Button, Halo, Screen, T } from '@/components/ui';
import { playSound } from '@/lib/sound';
import { useCheckout } from '@/state/checkout';
import { colors } from '@/theme';
import { endSale } from './actions';
import { s } from './styles';

// ---------- 22: Failed ----------

export function Failed({ payment }: { payment: PaymentSession }) {
  const busy = useCheckout((s) => s.busy);

  useEffect(() => {
    playSound('failed');
    AccessibilityInfo.announceForAccessibility(`Payment didn't go through. ${payment.failureReason ?? ''}`);
  }, [payment.id, payment.failureReason]);
  return (
    <Screen>
      <MerchantHeader showTill={false} />
      <View style={s.center}>
        <Halo color={colors.redTint} size={100}>
          <View style={[s.outcomeBadge, { backgroundColor: colors.red }]}>
            <Icon name="close" size={30} color={colors.white} strokeWidth={2.8} />
          </View>
        </Halo>
        <Text style={s.outcomeTitle}>{"Payment didn't\ngo through"}</Text>
        <Text style={s.outcomeAmount}>{formatMoney(payment.totalCents)}</Text>
      </View>
      <View style={s.reason}>
        <T v="eyebrow">Reason</T>
        <Text style={s.reasonTitle}>{payment.failureReason ?? 'The payment could not be completed.'}</Text>
        <T v="small" style={{ marginTop: 4 }}>
          No money has moved. You can try again or the customer can pay another way.
        </T>
      </View>
      <View style={{ paddingHorizontal: 20, paddingBottom: 20, gap: 12 }}>
        <Button title="Try again" loading={busy} onPress={() => useCheckout.getState().rearm()} testID="try-again" />
        <Button title="Cancel sale" kind="secondary" onPress={endSale} testID="cancel-sale" />
      </View>
    </Screen>
  );
}
