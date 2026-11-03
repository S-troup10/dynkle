import { ActivityIndicator, Animated, Pressable, Text, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { haptics } from '@/lib/haptics';
import { colors, shadows } from '@/theme';
import { Icon, type IconName } from '../Icon';
import { usePressScale } from './motion';
import { MAX_FONT_SCALE, styles } from './styles';

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
  accessibilityHint,
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
  /** What happens on press, when the title alone doesn't say (read by screen readers). */
  accessibilityHint?: string;
}) {
  const isDisabled = disabled || loading;
  const { style: pressStyle, handlers } = usePressScale(0.97);
  const a11y = {
    accessibilityRole: 'button' as const,
    accessibilityLabel: title,
    accessibilityHint,
    accessibilityState: { disabled: !!isDisabled, busy: !!loading },
  };
  const handlePress = () => {
    if (!isDisabled) haptics.tap();
    onPress?.();
  };
  if (kind === 'ghost') {
    return (
      <Pressable onPress={handlePress} disabled={isDisabled} style={[styles.ghost, style]} testID={testID} {...a11y}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.ghostText, isDisabled && { opacity: 0.5 }]}>
          {title}
        </Text>
      </Pressable>
    );
  }
  const k = buttonKinds[kind];
  return (
    <Pressable onPress={handlePress} disabled={isDisabled} testID={testID} {...a11y} {...(isDisabled ? null : handlers)}>
      <Animated.View style={[styles.button, k.container, disabled && styles.buttonDisabled, style, !isDisabled && pressStyle]}>
        {loading ? (
          <ActivityIndicator color={k.text.color as string} />
        ) : (
          <>
            {icon ? <Icon name={icon} size={20} color={disabled ? colors.muted : (k.text.color as string)} /> : null}
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.buttonText, k.text, disabled && { color: 'rgba(33,35,32,0.45)' }]}>
              {title}
            </Text>
            {trailingArrow ? <Icon name="arrowRight" size={18} color={k.text.color as string} /> : null}
          </>
        )}
      </Animated.View>
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
  /** Read by screen readers: an icon alone says nothing. */
  label: string;
}) {
  const { style: pressStyle, handlers } = usePressScale(0.92);
  return (
    <Pressable
      onPress={() => {
        haptics.tap();
        onPress?.();
      }}
      testID={testID}
      accessibilityLabel={label}
      accessibilityRole="button"
      {...handlers}
    >
      <Animated.View style={[styles.iconButton, { width: size, height: size }, pressStyle]}>
        <Icon name={name} size={20} />
      </Animated.View>
    </Pressable>
  );
}

/** Round −/+ steppers on the size picker and current order. */
export function RoundButton({
  name,
  onPress,
  size = 40,
  testID,
  label,
}: {
  name: IconName;
  onPress?: () => void;
  size?: number;
  testID?: string;
  /** Read by screen readers, e.g. "Remove one Latte". */
  label: string;
}) {
  const { style: pressStyle, handlers } = usePressScale(0.88);
  return (
    <Pressable
      onPress={() => {
        haptics.tap();
        onPress?.();
      }}
      testID={testID}
      accessibilityLabel={label}
      accessibilityRole="button"
      {...handlers}
    >
      <Animated.View style={[styles.round, { width: size, height: size }, pressStyle]}>
        <Icon name={name} size={size * 0.42} strokeWidth={2.4} />
      </Animated.View>
    </Pressable>
  );
}
