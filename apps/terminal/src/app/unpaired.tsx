import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button, IconBadge, Screen, T } from '@/components/ui';
import { useSession } from '@/state/session';
import { colors, fonts } from '@/theme';

export default function Unpaired() {
  const merchant = useSession((s) => s.profile?.merchant.name) ?? 'your business';
  return (
    <Screen glow="bottom">
      <View style={s.body}>
        <IconBadge name="unlink" tone="dark" size={100} />
        <Text style={s.title}>{'This terminal\nwas unpaired'}</Text>
        <T style={s.copy}>It was removed from {merchant}, so it can’t take payments. Pair it again to start selling.</T>
      </View>
      <View style={{ padding: 20, gap: 14 }}>
        <Button title="Pair again" trailingArrow onPress={() => {
            useSession.getState().forget();
            setTimeout(() => router.replace('/pair'), 0);
          }}
          testID="pair-again" />
        <T v="small" style={{ textAlign: 'center' }}>Didn’t expect this? Check Devices in your dashboard.</T>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, gap: 18 },
  title: { fontFamily: fonts.display, fontSize: 30, lineHeight: 34, color: colors.ink, textAlign: 'center', marginTop: 10 },
  copy: { textAlign: 'center', fontSize: 16, lineHeight: 24 },
});
