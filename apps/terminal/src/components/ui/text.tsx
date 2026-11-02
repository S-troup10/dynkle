import { Text, type TextProps, type TextStyle } from 'react-native';
import { colors, fonts } from '@/theme';
import { MAX_FONT_SCALE } from './styles';

export type TextVariant = 'display' | 'title' | 'heading' | 'amount' | 'amountSm' | 'body' | 'bodyStrong' | 'label' | 'small' | 'eyebrow' | 'mono';

export const textVariants: Record<TextVariant, TextStyle> = {
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

export function T({ v = 'body', style, ...rest }: TextProps & { v?: TextVariant }) {
  return <Text maxFontSizeMultiplier={MAX_FONT_SCALE} {...rest} style={[textVariants[v], style]} />;
}

/** "Ring up <any sale.>" — the second part is set in brand orange. */
export function Headline({ children, accent, size = 30, center }: { children?: string; accent?: string; size?: number; center?: boolean }) {
  return (
    <Text
      accessibilityRole="header"
      maxFontSizeMultiplier={MAX_FONT_SCALE}
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

export function SectionLabel({ children }: { children: string }) {
  return (
    <Text
      accessibilityRole="header"
      maxFontSizeMultiplier={MAX_FONT_SCALE}
      style={[textVariants.eyebrow, { marginTop: 18, marginBottom: 10, marginLeft: 4 }]}
    >
      {children}
    </Text>
  );
}
