import { StyleSheet, Text, View } from 'react-native';
import { router, usePathname } from 'expo-router';
import { formatMoney } from '@dynkle/shared';
import { formatTime } from '@/lib/format';
import { useCart } from '@/state/cart';
import { useCheckout } from '@/state/checkout';
import { colors, fonts, radius, shadows } from '@/theme';
import { Icon } from './Icon';
import { Button, T } from './ui';

/** "Incoming charge" card that a dashboard-sent charge pops over whatever the merchant is doing. */
export function RemoteChargeOverlay() {
  const incoming = useCheckout((s) => s.incoming);
  const payment = useCheckout((s) => s.payment);
  const busy = useCheckout((s) => s.busy);
  const keyed = useCart((s) => s.keypadCents);
  const path = usePathname();

  // Never interrupt a customer mid-payment; it waits until the terminal is free.
  const customerFacing = path.startsWith('/checkout') || (payment && !['cancelled'].includes(payment.status));
  if (!incoming || customerFacing) return null;

  const accept = async () => {
    const p = await useCheckout.getState().acceptIncoming();
    if (p) router.push('/checkout');
  };

  return (
    <View style={StyleSheet.absoluteFill} testID="remote-charge">
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]} />
      <View style={s.wrap}>
        <View style={s.card}>
          <View style={s.head}>
            <View style={s.icon}>
              <Icon name="monitor" size={20} color={colors.orange} strokeWidth={2} />
            </View>
            <View>
              <T v="eyebrow">From the dashboard</T>
              <Text style={s.headTitle}>Incoming charge</Text>
            </View>
          </View>
          <View style={s.amountBox}>
            <Text style={s.amount}>{formatMoney(incoming.amountCents)}</Text>
            <Text style={s.ref}>{incoming.reference}</Text>
            <T v="small">
              Sent at {formatTime(incoming.sentAt)} by {incoming.sentBy}
            </T>
          </View>
          {keyed > 0 ? (
            <T v="small" style={{ lineHeight: 19 }}>
              Your current entry of {formatMoney(keyed)} will be saved and come back after this payment.
            </T>
          ) : null}
          <Button title="Accept and arm" loading={busy} onPress={accept} testID="accept-remote" />
          <Button title="Not now" kind="secondary" onPress={() => useCheckout.getState().dismissIncoming()} testID="dismiss-remote" />
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', padding: 20 },
  card: { backgroundColor: colors.white, borderRadius: radius.sheet, padding: 22, gap: 16, ...shadows.raised },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  icon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.orangeTint, alignItems: 'center', justifyContent: 'center' },
  headTitle: { fontFamily: fonts.bodySemi, fontSize: 17, color: colors.ink, marginTop: 2 },
  amountBox: { backgroundColor: colors.bg, borderRadius: 18, padding: 18, gap: 4 },
  amount: { fontFamily: fonts.displayHeavy, fontSize: 40, color: colors.ink },
  ref: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.ink },
});
