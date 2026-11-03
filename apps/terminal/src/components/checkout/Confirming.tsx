import { Text, View } from 'react-native';
import { formatMoney, type PaymentSession } from '@dynkle/shared';
import { MerchantHeader } from '@/components/Header';
import { Icon } from '@/components/Icon';
import { Steps } from '@/components/Payment';
import { Button, Headline, Pill, Screen } from '@/components/ui';
import { useCheckout } from '@/state/checkout';
import { confirmationSteps } from '@/state/checkoutLogic';
import { useSession } from '@/state/session';
import { colors } from '@/theme';
import { s } from './styles';

// ---------- 19: Customer confirming ----------

const CHANNEL = { qr: 'QR', tap: 'tap', bluetooth: 'Bluetooth' } as const;

export function Confirming({ payment }: { payment: PaymentSession }) {
  const how = payment.method ? `${payment.method.wallet} connected by ${CHANNEL[payment.method.channel]}` : 'Wallet connected';
  return (
    <Screen glow="top">
      <MerchantHeader showTill={false} right={<Text style={s.headerAmount}>{formatMoney(payment.totalCents)}</Text>} />
      <View style={s.center}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
          <Waves />
          <View style={s.phone}>
            <View style={s.phoneScreen}>
              <Text style={s.phoneBiz}>{useSession.getState().profile?.merchant.name}</Text>
              <Text style={s.phoneAmount}>{formatMoney(payment.totalCents)}</Text>
              <View style={s.phoneBtn}>
                <Text style={s.phoneBtnText}>Approve</Text>
              </View>
            </View>
          </View>
        </View>
        <View style={{ marginTop: 28 }}>
          <Headline accent="your phone" size={26} center>
            Confirm on
          </Headline>
        </View>
        <Pill dot={colors.green} style={{ alignSelf: 'center', marginTop: 12 }}>
          {how}
        </Pill>
      </View>
      <View style={{ paddingHorizontal: 20, paddingBottom: 20, gap: 12 }}>
        <Steps steps={confirmationSteps(payment.status)} />
        <Button title="Cancel and re-arm" kind="ghost" onPress={() => useCheckout.getState().rearm()} testID="cancel-rearm" />
      </View>
    </Screen>
  );
}

function Waves() {
  return (
    <View style={{ width: 40, height: 80, justifyContent: 'center' }}>
      <Icon name="tap" size={44} color={colors.orange} />
    </View>
  );
}
