import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { api } from '@/api/client';
import { Sheet } from '@/components/Sheet';
import { Button, IconBadge, T } from '@/components/ui';
import { useSession } from '@/state/session';
import { colors, fonts } from '@/theme';

export default function UnpairConfirm() {
  const profile = useSession((s) => s.profile);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unpair = async () => {
    setBusy(true);
    try {
      await api.unpair();
      useSession.getState().forget();
      setTimeout(() => router.replace('/pair'), 0);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Sheet onDismiss={() => router.back()}>
      <View style={{ gap: 14, paddingBottom: 20 }}>
        <IconBadge name="unlink" tone="redTint" size={60} />
        <Text style={s.title}>Unpair this terminal?</Text>
        <T style={{ fontSize: 15, lineHeight: 23 }}>
          {profile?.till.name} will be removed from {profile?.merchant.name}. It can’t take payments until it’s paired again with a
          new code. Your sales history stays in the dashboard.
        </T>
        {error ? <T style={{ color: colors.red }}>{error}</T> : null}
      </View>
      <View style={{ gap: 12 }}>
        <Button title="Unpair terminal" kind="danger" loading={busy} onPress={unpair} testID="confirm-unpair" />
        <Button title="Cancel" kind="secondary" onPress={() => router.back()} />
      </View>
    </Sheet>
  );
}

const s = StyleSheet.create({
  title: { fontFamily: fonts.display, fontSize: 24, color: colors.ink, marginTop: 6 },
});
