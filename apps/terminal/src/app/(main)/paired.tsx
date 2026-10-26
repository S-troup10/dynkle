import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Icon } from '@/components/Icon';
import { Button, Card, Divider, Halo, Screen, T } from '@/components/ui';
import { useSession } from '@/state/session';
import { colors, fonts, shadows } from '@/theme';

export default function Paired() {
  const profile = useSession((s) => s.profile);
  const catalog = useQuery({ queryKey: ['catalog'], queryFn: api.catalog });
  if (!profile) return null;
  return (
    <Screen glow="center">
      <View style={s.body}>
        <Halo color={colors.orangeGlow} size={110}>
          <View style={[s.check, shadows.primary]}>
            <Icon name="check" size={40} color={colors.white} strokeWidth={2.6} />
          </View>
        </Halo>
        <Text style={s.title}>You’re live.</Text>
        <T style={{ textAlign: 'center' }}>This terminal is linked and ready to take payments.</T>
        <Card style={s.card}>
          <Text style={s.biz}>{profile.merchant.name}</Text>
          <Divider />
          <Line label="Till name" value={profile.till.name} />
          <Divider />
          <Line label="Menu" value={catalog.isSuccess ? 'Synced' : catalog.isError ? 'Not synced' : 'Syncing…'} />
          <Divider />
          <Line label="Tips" value={profile.settings.tipsEnabled ? 'On' : 'Off'} />
        </Card>
      </View>
      <View style={{ padding: 20 }}>
        <Button title="Start selling" trailingArrow onPress={() => router.replace('/keypad')} testID="start-selling" />
      </View>
    </Screen>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.line}>
      <Text style={s.lineLabel}>{label}</Text>
      <Text style={s.lineValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, gap: 14 },
  check: { width: 92, height: 92, borderRadius: 46, backgroundColor: colors.orange, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.display, fontSize: 32, color: colors.ink, marginTop: 8 },
  card: { alignSelf: 'stretch', padding: 0, marginTop: 12 },
  biz: { fontFamily: fonts.display, fontSize: 18, color: colors.ink, padding: 20 },
  line: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, height: 52, alignItems: 'center' },
  lineLabel: { fontFamily: fonts.body, fontSize: 15, color: colors.muted },
  lineValue: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.ink },
});
