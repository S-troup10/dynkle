import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Screen, T } from '@/components/ui';
import { colors, fonts, shadows } from '@/theme';

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
    height: 34,
    marginBottom: 28,
    ...shadows.card,
  },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.orange },
  badgeText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.ink },
  hero: { fontFamily: fonts.displayHeavy, fontSize: 72, lineHeight: 78, letterSpacing: -2, color: colors.ink },
  copy: { fontSize: 17, lineHeight: 26, marginTop: 28, maxWidth: 340 },
  footer: { paddingHorizontal: 24, paddingBottom: 24 },
});
