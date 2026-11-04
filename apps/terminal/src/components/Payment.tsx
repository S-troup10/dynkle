import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { colors, fonts, radius, shadows } from '@/theme';
import type { StepState } from '@/state/checkoutLogic';
import { Icon, type IconName } from './Icon';
import { Spinner } from './Spinner';

export function QRCard({ value, size = 200 }: { value: string; size?: number }) {
  return (
    <View
      style={[s.qrCard, { width: size + 40, height: size + 40 }]}
      testID="payment-qr"
      accessible
      accessibilityRole="image"
      accessibilityLabel="Payment QR code. Scan with the DYNK app or any Solana wallet."
    >
      <QRCode value={value} size={size} color={colors.ink} backgroundColor={colors.white} ecl="H" />
      <View style={s.qrLogo}>
        <Icon name="tap" size={20} color={colors.white} strokeWidth={2.4} />
      </View>
    </View>
  );
}

export function ProgressBar({ pct, dark }: { pct: number; dark?: boolean }) {
  return (
    <View style={[s.track, dark && { backgroundColor: 'rgba(255,255,255,0.12)' }]}>
      <View style={[s.bar, { width: `${Math.max(0, Math.min(100, pct))}%` }]} />
    </View>
  );
}

export function Steps({ steps }: { steps: { label: string; state: StepState }[] }) {
  return (
    <View style={s.steps}>
      {steps.map((st, i) => (
        <View key={st.label} style={[s.step, i > 0 && { borderTopWidth: 1, borderTopColor: colors.hairline }]}>
          {st.state === 'done' ? (
            <View style={s.stepDone}>
              <Icon name="check" size={14} color={colors.white} strokeWidth={3} />
            </View>
          ) : st.state === 'active' ? (
            <Spinner size={26} />
          ) : (
            <View style={s.stepTodo} />
          )}
          <Text style={[s.stepText, st.state === 'todo' && { color: colors.muted, fontFamily: fonts.body }]}>{st.label}</Text>
        </View>
      ))}
    </View>
  );
}

export function Banner({
  icon,
  title,
  body,
  tone,
  action,
}: {
  icon: IconName;
  title: string;
  body: string;
  tone: 'dark' | 'amber';
  action?: ReactNode;
}) {
  const dark = tone === 'dark';
  return (
    <View
      style={[
        s.banner,
        dark ? { backgroundColor: colors.ink } : { backgroundColor: colors.amberTint, borderColor: colors.amberLine, borderWidth: 1 },
      ]}
    >
      <Icon name={icon} size={24} color={dark ? colors.orange : colors.amberInk} />
      <View style={{ flex: 1 }}>
        <Text style={[s.bannerTitle, { color: dark ? colors.white : colors.amberInk }]}>{title}</Text>
        <Text style={[s.bannerBody, { color: dark ? 'rgba(255,255,255,0.75)' : colors.amberDeep }]}>{body}</Text>
      </View>
      {action}
    </View>
  );
}

const s = StyleSheet.create({
  qrCard: {
    alignSelf: 'center',
    borderRadius: radius.sheet,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.raised,
  },
  qrLogo: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.white,
  },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.fill, overflow: 'hidden' },
  bar: { height: 6, borderRadius: 3, backgroundColor: colors.orange },
  steps: { backgroundColor: colors.white, borderRadius: radius.card, ...shadows.card, overflow: 'hidden' },
  step: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, height: 56 },
  stepDone: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  stepTodo: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: 'rgba(33,35,32,0.25)' },
  stepText: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.ink },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: radius.card, paddingHorizontal: 18, paddingVertical: 14 },
  bannerTitle: { fontFamily: fonts.bodySemi, fontSize: 15 },
  bannerBody: { fontFamily: fonts.body, fontSize: 13, marginTop: 2 },
});
