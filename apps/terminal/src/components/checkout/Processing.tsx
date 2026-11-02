import { StyleSheet, Text, View } from 'react-native';
import { formatMoney, type PaymentSession } from '@dynkle/shared';
import { MerchantHeader } from '@/components/Header';
import { Icon } from '@/components/Icon';
import { Steps } from '@/components/Payment';
import { Spinner } from '@/components/Spinner';
import { Screen, T } from '@/components/ui';
import { confirmationSteps } from '@/state/checkoutLogic';
import { colors } from '@/theme';
import { s } from './styles';

// ---------- 20: Processing ----------

export function Processing({ payment }: { payment: PaymentSession }) {
  return (
    <Screen glow="top">
      <MerchantHeader showTill={false} />
      <View style={s.center}>
        <View style={{ width: 160, height: 160, alignItems: 'center', justifyContent: 'center' }}>
          <View style={StyleSheet.absoluteFill}>
            <Spinner size={160} stroke={5} />
          </View>
          <View style={s.processingCore}>
            <Icon name="tap" size={36} color={colors.orange} strokeWidth={2.4} />
          </View>
        </View>
        <Text style={[s.bigAmount, { marginTop: 28 }]}>{formatMoney(payment.totalCents)}</Text>
        <Text style={s.processingTitle}>Confirming payment</Text>
        <T>Usually takes a couple of seconds.</T>
      </View>
      <View style={{ paddingHorizontal: 20, paddingBottom: 28 }}>
        <Steps steps={confirmationSteps(payment.status)} />
      </View>
    </Screen>
  );
}
