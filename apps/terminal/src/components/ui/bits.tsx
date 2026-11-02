import { type ReactNode } from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, fonts } from '@/theme';
import { Icon, type IconName } from '../Icon';
import { MAX_FONT_SCALE, styles } from './styles';

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
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.pillText, { color: t.fg }]}>
        {children}
      </Text>
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
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.statusText, { color: ok ? colors.greenDeep : colors.red }]}>
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
  accessibilityHint,
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
  accessibilityHint?: string;
}) {
  const content = (
    <>
      {icon ? (
        <View style={[styles.rowIcon, iconTone === 'red' && { backgroundColor: colors.redTint }]}>
          <Icon name={icon} size={18} color={iconTone === 'red' ? colors.red : colors.ink} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          style={[styles.rowLabel, danger && { color: colors.red }, sub ? { fontFamily: fonts.bodySemi } : null]}
        >
          {label}
        </Text>
        {sub ? (
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.rowSub}>
            {sub}
          </Text>
        ) : null}
      </View>
      {valueNode ??
        (value ? (
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.rowValue}>
            {value}
          </Text>
        ) : null)}
      {chevron ? <Icon name="chevron" size={18} color={colors.muted} /> : null}
    </>
  );
  // Read the row as one item ("Sound, On") rather than as separate fragments.
  const a11yLabel = [label, sub, value].filter(Boolean).join(', ');
  if (!onPress) {
    return (
      <View style={styles.listRow} accessible accessibilityLabel={valueNode ? undefined : a11yLabel}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityLabel={valueNode ? undefined : a11yLabel}
      accessibilityHint={accessibilityHint}
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
