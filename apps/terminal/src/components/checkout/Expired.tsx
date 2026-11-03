import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { formatMoney, type PaymentSession } from '@dynkle/shared';
import { MerchantHeader } from '@/components/Header';
import { Icon } from '@/components/Icon';
import { Button, FadeInUp, Halo, PopIn, Screen, T } from '@/components/ui';
import { useCheckout } from '@/state/checkout';
import { useSession } from '@/state/session';
import { colors } from '@/theme';
import { endSale } from './actions';
import { s } from './styles';

// ---------- 23: Expired ----------

export function Expired({ payment }: { payment: PaymentSession }) {
  const busy = useCheckout((s) => s.busy);
  const lock = useSession((s) => s.profile?.settings.priceLockSeconds) ?? 90;
  const fromOrder = useCheckout((s) => (s.draft?.lines.some((l) => l.kind === 'item') ?? false) && s.draft?.source === 'terminal');
  return (
    <Screen>
      <MerchantHeader showTill={false} />
      <View style={s.center}>
        <PopIn>
          <Halo color={colors.amberTint} size={100}>
            <View style={[s.outcomeBadge, { backgroundColor: colors.amber }]}>
              <Icon name="clock" size={30} color={colors.amberInk} strokeWidth={2.4} />
            </View>
          </Halo>
        </PopIn>
        <FadeInUp delay={100} style={{ alignItems: 'center' }}>
          <Text style={s.outcomeTitle}>Price lock expired</Text>
          <Text style={s.outcomeAmount}>{formatMoney(payment.totalCents)}</Text>
          <T style={{ textAlign: 'center', paddingHorizontal: 28 }}>
            The customer didn’t pay within {lock} seconds, so the price was released. Nothing was charged.
          </T>
        </FadeInUp>
      </View>
      <View style={{ paddingHorizontal: 20, paddingBottom: 20, gap: 12 }}>
        <Button
          title={`Re-arm ${formatMoney(payment.totalCents)}`}
          loading={busy}
          onPress={() => useCheckout.getState().rearm()}
          testID="rearm"
        />
        {fromOrder ? (
          <Button
            title="Edit order"
            kind="secondary"
            onPress={() => {
              useCheckout.getState().finish(false);
              if (router.canDismiss()) router.dismissTo('/order');
              else router.replace('/order');
            }}
          />
        ) : null}
        <Pressable onPress={endSale} style={{ alignSelf: 'center', padding: 10 }} testID="expired-cancel">
          <Text style={s.link}>Cancel sale</Text>
        </Pressable>
      </View>
    </Screen>
  );
}
