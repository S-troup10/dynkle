import { type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { colors, fonts, gradients, radius, shadows } from '@/theme';
import { Icon, type IconName } from './Icon';

// ---------- Layout ----------

export function Screen({
  children,
  edges = ['top', 'bottom'],
  style,
  glow,
  background,
}: {
  children: ReactNode;
  edges?: Edge[];
  style?: StyleProp<ViewStyle>;
  /** Soft orange radial glow behind the content, as on the welcome and armed screens. */
  glow?: 'top' | 'center' | 'bottom';
  background?: 'default' | 'orange' | 'dark';
}) {
  const bg =
    background === 'orange'
      ? (['#FF9A33', '#FF8000', '#E66F00'] as const)
      : background === 'dark'
        ? (['#212320', '#212320'] as const)
        : gradients.screen;
  return (
    <LinearGradient colors={bg} start={{ x: 0.1, y: 0 }} end={{ x: 0.3, y: 1 }} style={styles.fill}>
      {glow ? <Glow position={glow} color={background === 'dark' ? 'rgba(255,128,0,0.28)' : colors.orangeGlow} /> : null}
      <SafeAreaView edges={edges} style={[styles.fill, style]}>
        {children}
      </SafeAreaView>
    </LinearGradient>
  );
}

export function Glow({ position, color = colors.orangeGlow }: { position: 'top' | 'center' | 'bottom'; color?: string }) {
  const top = position === 'top' ? '-20%' : position === 'center' ? '15%' : '55%';
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { top, height: '70%' }]}>
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color} stopOpacity={1} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#glow)" />
      </Svg>
    </View>
  );
}

// ---------- Text ----------

type Variant = 'display' | 'title' | 'heading' | 'amount' | 'amountSm' | 'body' | 'bodyStrong' | 'label' | 'small' | 'eyebrow' | 'mono';

const textVariants: Record<Variant, TextStyle> = {
  display: { fontFamily: fonts.displayHeavy, fontSize: 64, lineHeight: 70, letterSpacing: -1.5, color: colors.ink },
  title: { fontFamily: fonts.display, fontSize: 28, lineHeight: 34, letterSpacing: -0.3, color: colors.ink },
  heading: { fontFamily: fonts.display, fontSize: 20, lineHeight: 26, color: colors.ink },
  amount: { fontFamily: fonts.displayHeavy, fontSize: 56, letterSpacing: -1, color: colors.ink },
  amountSm: { fontFamily: fonts.display, fontSize: 16, color: colors.ink },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.muted },
  bodyStrong: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.ink },
  label: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.ink },
  small: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  eyebrow: { fontFamily: fonts.bodyMedium, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: colors.muted },
  mono: { fontFamily: fonts.displayMedium, fontSize: 14, color: colors.ink },
};

export function T({ v = 'body', style, ...rest }: TextProps & { v?: Variant }) {
  return <Text {...rest} style={[textVariants[v], style]} />;
}

/** "Ring up <any sale.>" — the second part is set in brand orange. */
export function Headline({ children, accent, size = 30, center }: { children?: string; accent?: string; size?: number; center?: boolean }) {
  return (
    <Text
      style={{
        fontFamily: fonts.display,
        fontSize: size,
        lineHeight: size * 1.15,
        letterSpacing: -0.3,
        color: colors.ink,
        textAlign: center ? 'center' : 'left',
      }}
    >
      {children}
      {accent ? <Text style={{ color: colors.orange }}>{children ? ' ' : ''}{accent}</Text> : null}
    </Text>
  );
}

// ---------- Buttons ----------

type ButtonKind = 'primary' | 'secondary' | 'dark' | 'danger' | 'ghost' | 'onOrange' | 'outlineOnOrange';

export function Button({
  title,
  onPress,
  kind = 'primary',
  icon,
  trailingArrow,
  disabled,
  loading,
  style,
  testID,
}: {
  title: string;
  onPress?: () => void;
  kind?: ButtonKind;
  icon?: IconName;
  trailingArrow?: boolean;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const isDisabled = disabled || loading;
  if (kind === 'ghost') {
    return (
      <Pressable onPress={onPress} disabled={isDisabled} style={[styles.ghost, style]} testID={testID} accessibilityRole="button">
        <Text style={[styles.ghostText, isDisabled && { opacity: 0.5 }]}>{title}</Text>
      </Pressable>
    );
  }
  const k = buttonKinds[kind];
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled }}
      style={({ pressed }) => [
        styles.button,
        k.container,
        disabled && styles.buttonDisabled,
        pressed && !isDisabled && { transform: [{ scale: 0.985 }], opacity: 0.92 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={k.text.color as string} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={20} color={disabled ? colors.muted : (k.text.color as string)} /> : null}
          <Text style={[styles.buttonText, k.text, disabled && { color: 'rgba(33,35,32,0.45)' }]}>{title}</Text>
          {trailingArrow ? <Icon name="arrowRight" size={18} color={k.text.color as string} /> : null}
        </>
      )}
    </Pressable>
  );
}

const buttonKinds: Record<Exclude<ButtonKind, 'ghost'>, { container: ViewStyle; text: TextStyle }> = {
  primary: { container: { backgroundColor: colors.orange, ...shadows.primary }, text: { color: colors.white } },
  secondary: { container: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line }, text: { color: colors.ink } },
  dark: { container: { backgroundColor: colors.ink }, text: { color: colors.white } },
  danger: { container: { backgroundColor: colors.red }, text: { color: colors.white } },
  onOrange: { container: { backgroundColor: colors.white }, text: { color: colors.ink } },
  outlineOnOrange: { container: { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.7)' }, text: { color: colors.white } },
};

export function IconButton({
  name,
  onPress,
  size = 44,
  testID,
  label,
}: {
  name: IconName;
  onPress?: () => void;
  size?: number;
  testID?: string;
  label?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityLabel={label}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.iconButton,
        { width: size, height: size },
        pressed && { backgroundColor: colors.orangeTint },
      ]}
    >
      <Icon name={name} size={20} />
    </Pressable>
  );
}

/** Round −/+ steppers on the size picker and current order. */
export function RoundButton({ name, onPress, size = 40, testID }: { name: IconName; onPress?: () => void; size?: number; testID?: string }) {
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.round,
        { width: size, height: size },
        pressed && { backgroundColor: colors.orangeTint },
      ]}
    >
      <Icon name={name} size={size * 0.42} strokeWidth={2.4} />
    </Pressable>
  );
}

// ---------- Bits ----------

export function Pill({
  children,
  dot,
  tone = 'neutral',
  style,
}: {
  children: ReactNode;
  dot?: string;
  tone?: 'neutral' | 'green' | 'red' | 'amber' | 'orange' | 'onOrange';
  style?: StyleProp<ViewStyle>;
}) {
  const t = pillTones[tone];
  return (
    <View style={[styles.pill, { backgroundColor: t.bg }, style]}>
      {dot ? <View style={[styles.dot, { backgroundColor: dot }]} /> : null}
      <Text style={[styles.pillText, { color: t.fg }]}>{children}</Text>
    </View>
  );
}

const pillTones = {
  neutral: { bg: colors.fill, fg: colors.ink },
  green: { bg: colors.greenTint, fg: colors.greenDeep },
  red: { bg: colors.redTint, fg: colors.red },
  amber: { bg: colors.amberTint, fg: colors.amberDeep },
  orange: { bg: colors.orangeTint, fg: colors.orangeDeep },
  onOrange: { bg: 'rgba(255,255,255,0.18)', fg: colors.white },
};

export function StatusText({ state }: { state: 'ready' | 'off' | 'unsupported' | 'unavailable' }) {
  const ok = state === 'ready';
  return (
    <View style={styles.row}>
      {ok ? <View style={[styles.dot, { backgroundColor: colors.green, marginRight: 6 }]} /> : null}
      <Text style={[styles.statusText, { color: ok ? colors.greenDeep : colors.red }]}>
        {ok ? 'Ready' : state === 'off' ? 'Off' : 'Unavailable'}
      </Text>
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Divider({ inset = 0 }: { inset?: number }) {
  return <View style={{ height: 1, backgroundColor: colors.hairline, marginLeft: inset }} />;
}

export function Row({
  label,
  sub,
  value,
  valueNode,
  onPress,
  chevron,
  icon,
  iconTone,
  danger,
  testID,
}: {
  label: string;
  sub?: string;
  value?: string;
  valueNode?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  icon?: IconName;
  iconTone?: 'neutral' | 'red';
  danger?: boolean;
  testID?: string;
}) {
  const content = (
    <>
      {icon ? (
        <View style={[styles.rowIcon, iconTone === 'red' && { backgroundColor: colors.redTint }]}>
          <Icon name={icon} size={18} color={iconTone === 'red' ? colors.red : colors.ink} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, danger && { color: colors.red }, sub ? { fontFamily: fonts.bodySemi } : null]}>{label}</Text>
        {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
      </View>
      {valueNode ?? (value ? <Text style={styles.rowValue}>{value}</Text> : null)}
      {chevron ? <Icon name="chevron" size={18} color={colors.muted} /> : null}
    </>
  );
  if (!onPress) return <View style={styles.listRow}>{content}</View>;
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      style={({ pressed }) => [styles.listRow, pressed && { backgroundColor: colors.orangeTint }]}
    >
      {content}
    </Pressable>
  );
}

export function List({ children, style }: { children: ReactNode[] | ReactNode; style?: StyleProp<ViewStyle> }) {
  const kids = (Array.isArray(children) ? children : [children]).flat().filter(Boolean);
  return (
    <Card style={[{ paddingVertical: 0, paddingHorizontal: 0, overflow: 'hidden' }, style]}>
      {kids.map((child, i) => (
        <View key={i}>
          {i > 0 ? <Divider /> : null}
          {child}
        </View>
      ))}
    </Card>
  );
}

export function SectionLabel({ children }: { children: string }) {
  return <Text style={[textVariants.eyebrow, { marginTop: 18, marginBottom: 10, marginLeft: 4 }]}>{children}</Text>;
}

export function IconBadge({
  name,
  tone = 'dark',
  size = 64,
}: {
  name: IconName;
  tone?: 'dark' | 'orange' | 'red' | 'amber' | 'white' | 'redTint';
  size?: number;
}) {
  const t = {
    dark: { bg: colors.ink, fg: colors.orange },
    orange: { bg: colors.orange, fg: colors.white },
    red: { bg: colors.red, fg: colors.white },
    redTint: { bg: colors.redTint, fg: colors.red },
    amber: { bg: colors.amber, fg: colors.amberInk },
    white: { bg: colors.white, fg: colors.orange },
  }[tone];
  return (
    <View style={[styles.center, { width: size, height: size, borderRadius: size / 2, backgroundColor: t.bg }]}>
      <Icon name={name} size={size * 0.42} color={t.fg} strokeWidth={2.4} />
    </View>
  );
}

/** Halo ring around a status badge (failed, expired, paid). */
export function Halo({ children, color, size = 100 }: { children: ReactNode; color: string; size?: number }) {
  return (
    <View style={[styles.center, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]}>{children}</View>
  );
}

export const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
  button: {
    height: 60,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 24,
  },
  buttonDisabled: { backgroundColor: colors.disabled, shadowOpacity: 0, elevation: 0, borderWidth: 0 },
  buttonText: { fontFamily: fonts.bodySemi, fontSize: 18 },
  ghost: { alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 16 },
  ghostText: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.ink, textDecorationLine: 'underline' },
  iconButton: {
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  round: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(33,35,32,0.15)',
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 28,
    paddingHorizontal: 11,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  pillText: { fontFamily: fonts.bodyMedium, fontSize: 13 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontFamily: fonts.bodySemi, fontSize: 13 },
  card: { backgroundColor: colors.white, borderRadius: radius.card, padding: 16, ...shadows.card },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 16, paddingVertical: 12 },
  rowIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.fill, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontFamily: fonts.body, fontSize: 15, color: colors.ink },
  rowSub: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, marginTop: 2 },
  rowValue: { fontFamily: fonts.body, fontSize: 14, color: colors.muted },
});
