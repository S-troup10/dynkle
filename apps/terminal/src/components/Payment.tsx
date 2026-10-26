import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { colors, fonts, radius, shadows } from '@/theme';
import { formatCountdown } from '@/lib/format';
import type { StepState } from '@/state/checkoutLogic';
import { Icon, type IconName } from './Icon';
import { Spinner } from './Spinner';

export function QRCard({ value, size = 200 }: { value: string; size?: number }) {
  return (
    <View style={[s.qrCard, { width: size + 40, height: size + 40 }]} testID="payment-qr" accessibilityLabel={value}>
      <QRCode value={value} size={size} color={colors.ink} backgroundColor={colors.white} ecl="H" />
      <View style={s.qrLogo}>
        <Icon name="tap" size={20} color={colors.white} strokeWidth={2.4} />
      </View>
    </View>
  );
}

export type ChannelState = 'ready' | 'unavailable';

export function MethodChips({ tap, connect, scan }: { tap: ChannelState; connect: ChannelState; scan: ChannelState }) {
  const chips: { label: string; icon: IconName; state: ChannelState }[] = [
    { label: 'Tap', icon: tap === 'ready' ? 'tap' : 'tapOff', state: tap },
    { label: 'Connect', icon: 'bluetooth', state: connect },
    { label: 'Scan', icon: 'scan', state: scan },
  ];
  return (
    <View style={s.chips}>
      {chips.map((c) => {
        const ok = c.state === 'ready';
        return (
          <View key={c.label} style={[s.chip, !ok && s.chipOff]} testID={`chip-${c.label.toLowerCase()}`}>
            <Icon name={c.icon} size={22} color={ok ? colors.orange : colors.muted} />
            <Text style={s.chipLabel}>{c.label}</Text>
            <View style={s.chipStatus}>
              {ok ? <View style={s.greenDot} /> : null}
              <Text style={[s.chipStatusText, { color: ok ? colors.greenDeep : colors.red }]}>{ok ? 'Ready' : 'Unavailable'}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

export function PriceLock({ secondsLeft, totalSeconds }: { secondsLeft: number; totalSeconds: number }) {
  const pct = totalSeconds > 0 ? Math.max(0, Math.min(1, secondsLeft / totalSeconds)) : 0;
  return (
    <View style={{ gap: 8 }}>
      <View style={s.lockRow}>
        <Text style={s.lockLabel}>Price locked</Text>
        <Text style={s.lockTime} testID="price-lock">{formatCountdown(secondsLeft)}</Text>
      </View>
      <View style={s.track}>
        <View style={[s.bar, { width: `${pct * 100}%` }]} />
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
    <View style={[s.banner, dark ? { backgroundColor: colors.ink } : { backgroundColor: colors.amberTint, borderColor: colors.amberLine, borderWidth: 1 }]}>
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
  chips: { flexDirection: 'row', gap: 10 },
  chip: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 4,
    ...shadows.card,
  },
  chipOff: { backgroundColor: colors.bg, shadowOpacity: 0, elevation: 0 },
  chipLabel: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink },
  chipStatus: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  greenDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.green },
  chipStatusText: { fontFamily: fonts.bodySemi, fontSize: 12 },
  lockRow: { flexDirection: 'row', justifyContent: 'space-between' },
  lockLabel: { fontFamily: fonts.body, fontSize: 14, color: colors.muted },
  lockTime: { fontFamily: fonts.display, fontSize: 14, color: colors.ink },
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
