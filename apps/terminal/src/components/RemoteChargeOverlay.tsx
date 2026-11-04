import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, usePathname } from 'expo-router';
import { formatMoney } from '@dynkle/shared';
import { formatTime } from '@/lib/format';
import { useCheckout } from '@/state/checkout';
import { colors, fonts, radius, shadows } from '@/theme';
import { Icon } from './Icon';
import { FadeInUp, T } from './ui';

/**
 * A charge sent from the dashboard arms itself the moment it's safe to: no "Accept" step.
 * This card is just a heads-up while that happens, never something to interact with.
 */
export function RemoteChargeOverlay() {
  const incoming = useCheckout((s) => s.incoming);
  const payment = useCheckout((s) => s.payment);
  const path = usePathname();
  const accepting = useRef<string | null>(null);

  // Never interrupt a customer mid-payment; it waits until the terminal is free, then arms itself.
  const customerFacing = path.startsWith('/checkout') || (payment && !['cancelled'].includes(payment.status));

  useEffect(() => {
    if (!incoming || customerFacing || accepting.current === incoming.id) return;
    accepting.current = incoming.id;
    useCheckout
      .getState()
      .acceptIncoming()
      .then((p) => {
        if (p) router.push('/checkout');
      })
      .finally(() => {
        accepting.current = null;
      });
  }, [incoming, customerFacing]);

  if (!incoming || customerFacing) return null;

  return (
    <View style={StyleSheet.absoluteFill} testID="remote-charge" pointerEvents="none">
      <FadeInUp style={s.wrap} distance={10}>
        <View style={s.card}>
          <View style={s.icon}>
            <Icon name="monitor" size={18} color={colors.orange} strokeWidth={2} />
          </View>
          <View style={{ flex: 1 }}>
            <T v="eyebrow">From the dashboard</T>
            <Text style={s.amount}>{formatMoney(incoming.amountCents)}</Text>
            <T v="small">
              {incoming.reference} · sent by {incoming.sentBy} at {formatTime(incoming.sentAt)}
            </T>
          </View>
        </View>
      </FadeInUp>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { paddingTop: 70, paddingHorizontal: 20 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.white,
    borderRadius: radius.card,
    padding: 16,
    ...shadows.raised,
  },
  icon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.orangeTint, alignItems: 'center', justifyContent: 'center' },
  amount: { fontFamily: fonts.displayHeavy, fontSize: 22, color: colors.ink },
});
