import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { api } from '@/api/client';
import { BackHeader } from '@/components/Header';
import { Keypad } from '@/components/Keypad';
import { Button, IconBadge, Screen, T } from '@/components/ui';
import { touchAdmin } from '@/hooks/useAdmin';
import { colors, compact, cs, fonts } from '@/theme';

const LENGTH = 6;

export default function AdminCode() {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const press = (k: string) => {
    setError(null);
    if (k === 'del') setPin((p) => p.slice(0, -1));
    else if (pin.length < LENGTH) setPin((p) => p + k);
  };

  const unlock = async () => {
    setBusy(true);
    try {
      const { ok } = await api.verifyAdmin(pin);
      if (ok) {
        touchAdmin();
        router.replace('/settings/admin');
      } else {
        setError("That code isn't right. Try again.");
        setPin('');
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <BackHeader />
      <View style={s.top}>
        <IconBadge name="lock" tone="dark" size={cs(64, 44)} />
        <Text style={s.title}>Admin code</Text>
        <T style={{ textAlign: 'center', fontSize: cs(15, 13), lineHeight: cs(22, 18) }}>
          Set by the owner in the merchant dashboard under Devices.
        </T>
        <View style={s.dots} testID="pin-dots">
          {Array.from({ length: LENGTH }, (_, i) => (
            <View key={i} style={[s.dot, i < pin.length && s.dotOn]} />
          ))}
        </View>
        {error ? <Text style={s.error}>{error}</Text> : null}
      </View>
      <View style={{ paddingHorizontal: 20, paddingBottom: compact ? 12 : 20, gap: cs(14, 8) }}>
        <Keypad mode="pin" onKey={press} keyHeight={cs(62, 50)} />
        <Button title="Unlock" disabled={pin.length < 4} loading={busy} onPress={unlock} testID="unlock" />
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  top: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: cs(10, 6), paddingHorizontal: 28 },
  title: { fontFamily: fonts.display, fontSize: cs(26, 21), color: colors.ink, marginTop: cs(10, 4) },
  dots: { flexDirection: 'row', gap: cs(14, 10), marginTop: cs(18, 10) },
  dot: { width: cs(14, 11), height: cs(14, 11), borderRadius: cs(7, 6), borderWidth: 1.5, borderColor: 'rgba(33,35,32,0.25)' },
  dotOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  error: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.red, marginTop: 6 },
});
