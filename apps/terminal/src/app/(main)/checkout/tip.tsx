import { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { formatMoney, keypadPress, percentOf } from '@dynkle/shared';
import { AnimatedAmount } from '@/components/AnimatedAmount';
import { MerchantHeader } from '@/components/Header';
import { Keypad } from '@/components/Keypad';
import { Button, Headline, Screen, T } from '@/components/ui';
import { useCheckout } from '@/state/checkout';
import { useSession } from '@/state/session';
import { colors, compact, cs, fonts, shadows } from '@/theme';

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

  // Move to the charge screen the instant the merchant picks a tip, instead of waiting
  // on the arm request's round trip first — the charge screen shows its own "arming"
  // state for that gap. Bounce back here (with an alert) only if arming actually fails.
  const arm = (tip: number) => {
    router.replace('/checkout');
    useCheckout.getState().arm(tip).then((p) => {
      if (p) return;
      const message = useCheckout.getState().error ?? 'Could not start the charge.';
      if (Platform.OS === 'web') window.alert(message);
      else Alert.alert('Could not start the charge', message);
      router.back();
    });
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
          <AnimatedAmount value={formatMoney(custom)} style={s.customAmount} testID="custom-tip" />
          <T v="small">on {formatMoney(subtotal)}</T>
        </View>
        <View style={{ paddingHorizontal: 20, paddingBottom: cs(20, 10), gap: cs(12, 8) }}>
          <Keypad onKey={(k) => setCustom((c) => keypadPress(c, k))} keyHeight={cs(60, 54)} />
          <Button
            title={`Add ${formatMoney(custom)} tip`}
            disabled={custom <= 0}
            loading={busy}
            onPress={() => arm(custom)}
            testID="custom-tip-add"
          />
          <Button title="Back" kind="ghost" onPress={() => setSelected(null)} />
        </View>
      </Screen>
    );
  }

  const tiles = presets.slice(0, 3).map((pct) => ({ key: String(pct), pct: pct as number | null, cents: percentOf(subtotal, pct) }));
  const cells = [...tiles, { key: 'custom', pct: null, cents: 0 }];
  const rows = [cells.slice(0, 2), cells.slice(2, 4)];

  return (
    <Screen glow="bottom">
      {header}
      <View style={s.top}>
        <T v="eyebrow">Your total</T>
        <Text style={s.total} testID="tip-total">
          {formatMoney(subtotal)}
        </Text>
        <View style={{ marginTop: cs(18, 8) }}>
          <Headline accent="tip?" size={cs(26, 20)} center>
            Add a
          </Headline>
        </View>
      </View>
      {/* A 2x2 grid of square tiles that fills whatever space is left, instead of
          fixed-height tiles floating above empty space on a short screen. */}
      <View style={s.grid}>
        {rows.map((row, r) => (
          <View key={r} style={s.gridRow}>
            {row.map((t) =>
              t.pct === null ? (
                <Pressable key="custom" onPress={() => setSelected('custom')} style={s.tile} testID="tip-custom">
                  <Text style={[s.pct, { fontSize: cs(22, 18) }]}>Custom</Text>
                  <Text style={s.tileSub}>Enter amount</Text>
                </Pressable>
              ) : (
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
              ),
            )}
          </View>
        ))}
      </View>
      {error ? <T style={{ color: colors.red, textAlign: 'center' }}>{error}</T> : null}
      <View style={{ paddingHorizontal: 20, paddingBottom: compact ? 12 : 20, paddingTop: 8 }}>
        <Button title="No tip" kind="secondary" loading={busy && selected === null} onPress={() => arm(0)} testID="no-tip" />
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  cancel: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.ink },
  top: { alignItems: 'center', marginTop: cs(24, 12), marginBottom: cs(24, 10) },
  total: { fontFamily: fonts.displayHeavy, fontSize: cs(52, 32), letterSpacing: -1, color: colors.ink, marginTop: 6 },
  grid: { flex: 1, paddingHorizontal: 20, paddingBottom: 12, gap: 12 },
  gridRow: { flex: 1, flexDirection: 'row', gap: 12 },
  tile: {
    flex: 1,
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
  pct: { fontFamily: fonts.displayHeavy, fontSize: cs(30, 26), color: colors.ink },
  tileSub: { fontFamily: fonts.body, fontSize: cs(15, 13), color: colors.muted },
  customTop: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  customAmount: { fontFamily: fonts.displayHeavy, fontSize: cs(52, 38), color: colors.ink },
});
