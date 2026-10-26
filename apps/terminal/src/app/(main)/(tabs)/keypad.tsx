import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { formatMoney, keypadPress } from '@dynkle/shared';
import { MerchantHeader } from '@/components/Header';
import { Keypad } from '@/components/Keypad';
import { OfflineBanner } from '@/components/OfflineBanner';
import { Button, Screen, T } from '@/components/ui';
import { startSale } from '@/lib/sale';
import { useCart } from '@/state/cart';
import { cartCount, cartTotal } from '@/state/cartLogic';
import { useCheckout } from '@/state/checkout';
import { useOffline } from '@/state/ui';
import { colors, fonts } from '@/theme';

export default function KeypadScreen() {
  const cents = useCart((s) => s.keypadCents);
  const lines = useCart((s) => s.lines);
  const busy = useCheckout((s) => s.busy);
  const { offline } = useOffline();
  const inOrder = cartCount(lines);

  const charge = () => {
    if (inOrder > 0) {
      // Keyed amount joins the items already in the order.
      useCart.getState().addCustom(cents);
      useCart.getState().setKeypad(0);
      router.push('/order');
      return;
    }
    startSale({
      lines: [{ id: 'custom', kind: 'custom', name: 'Custom amount', detail: 'Keyed in', unitCents: cents, qty: 1 }],
      subtotalCents: cents,
      source: 'terminal',
    });
  };

  return (
    <Screen edges={['top']}>
      <MerchantHeader right="settings" />
      <OfflineBanner />
      <View style={s.display}>
        <T v="eyebrow">Custom amount</T>
        <Text style={s.amount} numberOfLines={1} adjustsFontSizeToFit testID="keypad-amount">
          {formatMoney(cents)}
        </Text>
        {inOrder > 0 ? (
          <T v="small" onPress={() => router.push('/order')} style={{ color: colors.orangeDeep, fontFamily: fonts.bodySemi }}>
            {`${inOrder} ${inOrder === 1 ? 'item' : 'items'} in order · ${formatMoney(cartTotal(lines))}`}
          </T>
        ) : null}
      </View>
      <View style={s.pad}>
        <Keypad onKey={(k) => useCart.getState().setKeypad(keypadPress(cents, k))} />
        <Button
          title={
            offline
              ? 'Charge unavailable offline'
              : inOrder > 0
                ? `Add ${formatMoney(cents)} to order`
                : `Charge ${formatMoney(cents)}`
          }
          onPress={charge}
          disabled={offline || cents <= 0}
          loading={busy}
          testID="keypad-charge"
        />
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  display: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 20 },
  amount: { fontFamily: fonts.displayHeavy, fontSize: 58, letterSpacing: -1, color: colors.ink },
  pad: { paddingHorizontal: 20, paddingBottom: 16, gap: 14 },
});
