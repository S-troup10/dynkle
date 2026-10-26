import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSession } from '@/state/session';
import { useOffline } from '@/state/ui';
import { colors, fonts } from '@/theme';
import { IconButton, Pill } from './ui';

/** "Dynkle Café  • Till 2   [settings]" — the top bar on the main tabs and checkout. */
export function MerchantHeader({
  right,
  showTill = true,
  tillDot = true,
  light,
}: {
  right?: ReactNode | 'settings';
  showTill?: boolean;
  tillDot?: boolean;
  light?: boolean;
}) {
  const profile = useSession((s) => s.profile);
  const { offline } = useOffline();
  const name = profile?.merchant.name ?? 'Dynkle';
  return (
    <View style={s.bar}>
      <View style={s.left}>
        <Text style={[s.biz, light && { color: colors.white }]} numberOfLines={1}>
          {name}
        </Text>
        {showTill && profile ? (
          offline && right === 'settings' ? (
            <Pill dot={colors.red}>Offline</Pill>
          ) : (
            <Pill dot={tillDot ? colors.green : undefined} tone={light ? 'onOrange' : 'neutral'}>
              {profile.till.name}
            </Pill>
          )
        ) : null}
      </View>
      {right === 'settings' ? (
        <IconButton name="settings" label="Settings" testID="open-settings" onPress={() => router.push('/settings')} />
      ) : (
        right
      )}
    </View>
  );
}

/** Back button + title, for drill-in screens. */
export function BackHeader({
  title,
  eyebrow,
  onBack,
  right,
}: {
  title?: string;
  eyebrow?: string;
  onBack?: () => void;
  right?: ReactNode;
}) {
  return (
    <View style={s.bar}>
      <View style={s.left}>
        <IconButton
          name="back"
          label="Back"
          testID="back"
          onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))}
        />
        <View style={{ flexShrink: 1 }}>
          {eyebrow ? <Text style={s.eyebrow}>{eyebrow}</Text> : null}
          {title ? (
            <Text style={s.title} numberOfLines={1}>
              {title}
            </Text>
          ) : null}
        </View>
      </View>
      {right}
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    height: 68,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    gap: 12,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 },
  biz: { fontFamily: fonts.display, fontSize: 16, color: colors.ink, flexShrink: 1 },
  eyebrow: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.muted, letterSpacing: 0.5 },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.ink },
});
