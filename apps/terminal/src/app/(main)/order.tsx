import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { formatMoney, gstIncluded, type OrderLine } from '@dynkle/shared';
import { BackHeader } from '@/components/Header';
import { Icon, type IconName } from '@/components/Icon';
import { Button, RoundButton, Screen, T } from '@/components/ui';
import { chargeOrder } from '@/lib/sale';
import { useCart } from '@/state/cart';
import { cartCount, cartTotal } from '@/state/cartLogic';
import { useCheckout } from '@/state/checkout';
import { useOffline } from '@/state/ui';
import { colors, fonts, radius, shadows } from '@/theme';

export default function CurrentOrder() {
  const lines = useCart((s) => s.lines);
  const busy = useCheckout((s) => s.busy);
  const { offline } = useOffline();
  const total = cartTotal(lines);

  const clear = () => {
    useCart.getState().clear();
    router.back();
  };

  return (
    <Screen>
      <BackHeader
        title="Current order"
        right={
          lines.length > 0 ? (
            <Pressable onPress={clear} hitSlop={10} testID="clear-order">
              <Text style={s.clear}>Clear</Text>
            </Pressable>
          ) : null
        }
      />
      <ScrollView contentContainerStyle={s.content}>
        {lines.length > 0 ? (
          <View style={s.card}>
            {lines.map((l, i) => (
              <LineRow key={l.id} line={l} first={i === 0} />
            ))}
          </View>
        ) : (
          <T style={{ textAlign: 'center', marginVertical: 40 }}>The order is empty.</T>
        )}
        <View style={s.actions}>
          <DashedButton icon="plus" label="Custom amount" onPress={() => router.navigate('/keypad')} />
          <DashedButton
            icon="tag"
            label="Promo code"
            onPress={() => {
              const msg = 'Promo codes are set up in the merchant dashboard and arrive in a later update.';
              if (Platform.OS === 'web') window.alert(msg);
              else Alert.alert('Promo codes', msg);
            }}
          />
        </View>
      </ScrollView>
      <View style={s.footer}>
        <View style={s.sumRow}>
          <T v="small">Items</T>
          <T v="small">{cartCount(lines)}</T>
        </View>
        <View style={s.sumRow}>
          <T v="small">Includes GST</T>
          <T v="small">{formatMoney(gstIncluded(total))}</T>
        </View>
        <View style={[s.sumRow, { marginTop: 10, marginBottom: 14 }]}>
          <Text style={s.totalLabel}>Total</Text>
          <Text style={s.total} testID="order-total">
            {formatMoney(total)}
          </Text>
        </View>
        <Button
          title={offline ? 'Charge unavailable offline' : `Charge ${formatMoney(total)}`}
          disabled={offline || total <= 0}
          loading={busy}
          onPress={chargeOrder}
          testID="order-charge"
        />
      </View>
    </Screen>
  );
}

function LineRow({ line, first }: { line: OrderLine; first: boolean }) {
  const cart = useCart.getState();
  const detail =
    line.kind === 'custom'
      ? line.detail
      : line.detail && line.qty > 1
        ? `${line.detail} · ${formatMoney(line.unitCents)} each`
        : line.detail || (line.qty > 1 ? `${formatMoney(line.unitCents)} each` : '');
  return (
    <View style={[s.line, !first && s.divider]} testID={`line-${line.name}`}>
      <View style={{ flex: 1 }}>
        <Text style={s.lineName}>{line.name}</Text>
        {detail ? <Text style={s.lineDetail}>{detail}</Text> : null}
      </View>
      {line.kind === 'custom' ? (
        <RoundButton name="close" size={36} onPress={() => cart.remove(line.id)} testID={`remove-${line.name}`} />
      ) : (
        <View style={s.stepper}>
          <RoundButton name="minus" size={36} onPress={() => cart.changeQty(line.id, -1)} testID={`minus-${line.name}`} />
          <Text style={s.qty}>{line.qty}</Text>
          <RoundButton name="plus" size={36} onPress={() => cart.changeQty(line.id, 1)} testID={`plus-${line.name}`} />
        </View>
      )}
      <Text style={s.lineTotal}>{formatMoney(line.unitCents * line.qty)}</Text>
    </View>
  );
}

function DashedButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.dashed, pressed && { backgroundColor: colors.orangeTint }]}>
      <Icon name={icon} size={18} />
      <Text style={s.dashedText}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  clear: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.red },
  content: { paddingHorizontal: 20, paddingBottom: 20 },
  card: { backgroundColor: colors.white, borderRadius: radius.card, overflow: 'hidden', ...shadows.card },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  divider: { borderTopWidth: 1, borderTopColor: colors.hairline },
  lineName: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.ink },
  lineDetail: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, marginTop: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  qty: { fontFamily: fonts.display, fontSize: 15, color: colors.ink, minWidth: 16, textAlign: 'center' },
  lineTotal: { fontFamily: fonts.display, fontSize: 15, color: colors.ink, minWidth: 64, textAlign: 'right' },
  actions: { flexDirection: 'row', gap: 12, marginTop: 14 },
  dashed: {
    flex: 1,
    height: 50,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(33,35,32,0.2)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  dashedText: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.ink },
  footer: { paddingHorizontal: 20, paddingBottom: 20 },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3 },
  totalLabel: { fontFamily: fonts.bodySemi, fontSize: 18, color: colors.ink },
  total: { fontFamily: fonts.displayHeavy, fontSize: 32, color: colors.ink },
});
