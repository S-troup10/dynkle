import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Screen, T } from '@/components/ui';
import { colors, compact, cs, fonts, shadows } from '@/theme';

export default function Welcome() {
  return (
    <Screen glow="top">
      <View style={s.body}>
        <View style={s.badge}>
          <View style={s.dot} />
          <Text style={s.badgeText}>Dynkle · a DYNK company</Text>
        </View>
        <Text style={s.hero}>Tap.</Text>
        <Text style={s.hero}>Pay.</Text>
        <Text style={[s.hero, { color: colors.orange }]}>1¢.</Text>
        <T style={s.copy}>Let’s get this terminal set up so you can take crypto payments at the counter.</T>
      </View>
      <View style={s.footer}>
        <Button title="Get started" trailingArrow onPress={() => router.push('/intro')} testID="get-started" />
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    backgroundColor: colors.white,
    borderRadius: 999,
    paddingHorizontal: 14,
    height: cs(34, 28),
    marginBottom: cs(28, 14),
    ...shadows.card,
  },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.orange },
  badgeText: { fontFamily: fonts.bodyMedium, fontSize: cs(14, 12), color: colors.ink },
  hero: {
    fontFamily: fonts.displayHeavy,
    fontSize: cs(72, 44),
    lineHeight: cs(78, 48),
    letterSpacing: -2,
    color: colors.ink,
  },
  copy: { fontSize: cs(17, 14), lineHeight: cs(26, 20), marginTop: cs(28, 14), maxWidth: 340 },
  footer: { paddingHorizontal: 24, paddingBottom: compact ? 12 : 24 },
});
