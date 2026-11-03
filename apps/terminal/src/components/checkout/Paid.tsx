import { useEffect, useState } from 'react';
import { AccessibilityInfo, Text, View } from 'react-native';
import { router } from 'expo-router';
import { formatMoney, formatTokenAmount, type PaymentSession } from '@dynkle/shared';
import { MerchantHeader } from '@/components/Header';
import { Icon } from '@/components/Icon';
import { Button, Halo, Screen } from '@/components/ui';
import { useCountdown } from '@/hooks/useCountdown';
import { methodLabel } from '@/lib/format';
import { playSound } from '@/lib/sound';
import { colors, fonts } from '@/theme';
import { endSale } from './actions';
import { s } from './styles';

export const AUTO_RETURN_SECONDS = 5;

// ---------- 21: Paid ----------

export function Paid({ payment }: { payment: PaymentSession }) {
  const [deadline] = useState(() => Date.now() + AUTO_RETURN_SECONDS * 1000);
  const [paused, setPaused] = useState(false);
  const left = useCountdown(paused ? null : deadline);

  useEffect(() => {
    playSound('paid');
    AccessibilityInfo.announceForAccessibility(`Paid, ${formatMoney(payment.totalCents)}`);
  }, [payment.id, payment.totalCents]);

  useEffect(() => {
    if (!paused && left <= 0) endSale();
  }, [left, paused]);

  return (
    <Screen background="orange">
      <MerchantHeader light tillDot={false} />
      <Text style={s.watermark} pointerEvents="none">
        PAID.
      </Text>
      <View style={s.center}>
        <Halo color="rgba(255,255,255,0.18)" size={140}>
          <View style={s.paidCheck}>
            <Icon name="check" size={48} color={colors.orange} strokeWidth={2.8} />
          </View>
        </Halo>
        <Text style={s.paidTitle} testID="paid-title">
          Paid
        </Text>
        <Text style={s.paidAmount}>{formatMoney(payment.totalCents)}</Text>
        <Text style={s.paidSub}>{methodLabel(payment.method)} · confirmed on Solana</Text>
        {payment.dynk && payment.verification?.receivedRaw ? (
          <Text style={s.paidSub} testID="paid-dynk">
            {formatTokenAmount(payment.verification.receivedRaw, payment.dynk.decimals)} DYNK received
          </Text>
        ) : null}
        {payment.dynk && payment.verification?.excessRaw ? (
          // Customers type the amount today: an overpayment is accepted but flagged for a refund.
          <Text style={[s.paidSub, { fontFamily: fonts.bodySemi }]} testID="paid-excess">
            Overpaid by {formatTokenAmount(payment.verification.excessRaw, payment.dynk.decimals)} DYNK — refund the difference
          </Text>
        ) : null}
      </View>
      <View style={{ paddingHorizontal: 20, paddingBottom: 16, gap: 12 }}>
        <Button
          title="Show receipt QR"
          kind="outlineOnOrange"
          onPress={() => {
            setPaused(true);
            router.push({ pathname: '/receipt/[paymentId]', params: { paymentId: payment.id } });
          }}
        />
        <Button title="New sale" kind="onOrange" onPress={endSale} testID="new-sale" />
        <Text style={s.paidFoot}>{paused ? 'Tap New sale when you’re done' : `Back to keypad in ${Math.ceil(left)}s`}</Text>
      </View>
    </Screen>
  );
}
