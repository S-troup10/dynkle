import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { BackHeader } from '@/components/Header';
import { List, Row, RoundButton, Screen, SectionLabel, T } from '@/components/ui';
import { useSession } from '@/state/session';
import { colors, fonts } from '@/theme';

/**
 * Tip presets aren't a dashboard setting on this backend yet, so this edits the
 * terminal's own copy of `profile.settings` directly (persisted locally, same as
 * the rest of the paired profile) rather than calling an API.
 */
const MIN_PCT = 0;
const MAX_PCT = 100;
const STEP = 5;

export default function TipsSettings() {
  const profile = useSession((s) => s.profile);
  if (!profile) return null;
  const { tipsEnabled, tipPresets } = profile.settings;
  const presets = [tipPresets[0] ?? 10, tipPresets[1] ?? 15, tipPresets[2] ?? 20];

  const save = (patch: Partial<typeof profile.settings>) => {
    useSession.getState().setProfile({ ...profile, settings: { ...profile.settings, ...patch } });
  };

  const setPreset = (i: number, pct: number) => {
    const next = [...presets];
    next[i] = Math.max(MIN_PCT, Math.min(MAX_PCT, pct));
    save({ tipPresets: next });
  };

  return (
    <Screen>
      <BackHeader title="Tips" onBack={() => router.dismissTo('/settings/admin')} />
      <ScrollView contentContainerStyle={s.content}>
        <SectionLabel>CUSTOMER TIP PROMPT</SectionLabel>
        <List>
          <Row
            label="Ask for a tip"
            sub="Shown before every charge, unless the order came from the dashboard"
            valueNode={
              <Switch
                value={tipsEnabled}
                onValueChange={(v) => save({ tipsEnabled: v })}
                trackColor={{ false: colors.disabled, true: colors.orange }}
                testID="tips-enabled"
              />
            }
          />
        </List>
        {tipsEnabled ? (
          <>
            <SectionLabel>PRESETS</SectionLabel>
            <List>
              {presets.map((pct, i) => (
                <Row
                  key={i}
                  label={`Preset ${i + 1}`}
                  valueNode={
                    <View style={s.stepper}>
                      <RoundButton name="minus" size={32} label={`Lower preset ${i + 1}`} onPress={() => setPreset(i, pct - STEP)} />
                      <Text style={s.pct}>{pct}%</Text>
                      <RoundButton name="plus" size={32} label={`Raise preset ${i + 1}`} onPress={() => setPreset(i, pct + STEP)} />
                    </View>
                  }
                  testID={`tip-preset-${i}`}
                />
              ))}
            </List>
            <T style={s.note}>Customers see these three, plus a custom amount, when a sale is rung up.</T>
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 24 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  pct: { fontFamily: fonts.display, fontSize: 18, color: colors.ink, minWidth: 44, textAlign: 'center' },
  note: { marginTop: 10 },
});
