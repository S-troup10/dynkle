import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { formatMoney, keypadPress, percentOf } from '@dynkle/shared';
import { MerchantHeader } from '@/components/Header';
import { Keypad } from '@/components/Keypad';
import { Button, Headline, Screen, T } from '@/components/ui';
import { useCheckout } from '@/state/checkout';
import { useSession } from '@/state/session';
import { colors, fonts, shadows } from '@/theme';

/** Customer-facing tip prompt, shown before the charge is armed. */
export default function Tip() {
  const draft = useCheckout((s) => s.draft);
  const busy = useCheckout((s) => s.busy);
  const error = useCheckout((s) => s.error);
  const presets = useSession((s) => s.profile?.settings.tipPresets) ?? [10, 15, 20];
  const [selected, setSelected] = useState<number | 'custom' | null>(null);
  const [custom, setCustom] = useState(0);

  if (!draft) return null;
  const subtotal = draft.subtotalCents;

  const arm = async (tip: number) => {
    const p = await useCheckout.getState().arm(tip);
    if (p) router.replace('/checkout');
  };

  const cancel = () => {
    useCheckout.getState().finish(false);
    router.back();
  };

  const header = (
    <MerchantHeader
      showTill={false}
      right={
        <Pressable onPress={cancel} hitSlop={10} testID="tip-cancel">
          <Text style={s.cancel}>Cancel</Text>
        </Pressable>
      }
    />
  );

  if (selected === 'custom') {
    return (
      <Screen>
        {header}
        <View style={s.customTop}>
          <T v="eyebrow">Custom tip</T>
          <Text style={s.customAmount} testID="custom-tip">
            {formatMoney(custom)}
          </Text>
          <T v="small">on {formatMoney(subtotal)}</T>
        </View>
        <View style={{ paddingHorizontal: 20, paddingBottom: 20, gap: 12 }}>
          <Keypad onKey={(k) => setCustom((c) => keypadPress(c, k))} keyHeight={60} />
          <Button title={`Add ${formatMoney(custom)} tip`} disabled={custom <= 0} loading={busy} onPress={() => arm(custom)} testID="custom-tip-add" />
          <Button title="Back" kind="ghost" onPress={() => setSelected(null)} />
        </View>
      </Screen>
    );
  }

  const tiles = presets.slice(0, 3).map((pct) => ({ key: pct, pct, cents: percentOf(subtotal, pct) }));

  return (
    <Screen glow="bottom">
      {header}
      <View style={s.top}>
        <T v="eyebrow">Your total</T>
        <Text style={s.total} testID="tip-total">
          {formatMoney(subtotal)}
        </Text>
        <View style={{ marginTop: 18 }}>
          <Headline accent="tip?" size={26} center>
            Add a
          </Headline>
        </View>
      </View>
      <View style={s.grid}>
        {tiles.map((t) => (
          <Pressable
            key={t.key}
            onPress={() => {
              setSelected(t.pct);
              arm(t.cents);
            }}
            disabled={busy}
            style={[s.tile, selected === t.pct && s.tileOn]}
            testID={`tip-${t.pct}`}
          >
            <Text style={s.pct}>{t.pct}%</Text>
            <Text style={s.tileSub}>{formatMoney(t.cents)}</Text>
          </Pressable>
        ))}
        <Pressable onPress={() => setSelected('custom')} style={s.tile} testID="tip-custom">
          <Text style={[s.pct, { fontSize: 22 }]}>Custom</Text>
          <Text style={s.tileSub}>Enter amount</Text>
        </Pressable>
      </View>
      {error ? <T style={{ color: colors.red, textAlign: 'center', marginTop: 8 }}>{error}</T> : null}
      <View style={{ flex: 1 }} />
      <View style={{ paddingHorizontal: 20, paddingBottom: 20 }}>
        <Button title="No tip" kind="secondary" loading={busy && selected === null} onPress={() => arm(0)} testID="no-tip" />
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  cancel: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.ink },
  top: { alignItems: 'center', marginTop: 24, marginBottom: 24 },
  total: { fontFamily: fonts.displayHeavy, fontSize: 52, letterSpacing: -1, color: colors.ink, marginTop: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 20 },
  tile: {
    width: '47%',
    flexGrow: 1,
    height: 134,
    borderRadius: 24,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 2,
    borderColor: 'transparent',
    ...shadows.card,
  },
  tileOn: { borderColor: colors.orange, backgroundColor: colors.orangeTint },
  pct: { fontFamily: fonts.displayHeavy, fontSize: 30, color: colors.ink },
  tileSub: { fontFamily: fonts.body, fontSize: 15, color: colors.muted },
  customTop: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  customAmount: { fontFamily: fonts.displayHeavy, fontSize: 52, color: colors.ink },
});
