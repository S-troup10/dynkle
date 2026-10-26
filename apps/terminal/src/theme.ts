import { Platform, type ViewStyle } from 'react-native';

export const colors = {
  ink: '#212320',
  muted: '#5A5C58',
  white: '#FFFFFF',
  bg: '#F6F6F2',
  orange: '#FF8000',
  orangeDeep: '#E66F00',
  orangeLight: '#FFB566',
  orangeTint: '#FFF5EB',
  orangeGlow: '#FFE7CF',
  green: '#28AD0D',
  greenDeep: '#1E7A0B',
  greenTint: '#EAF7E6',
  red: '#AD0D0D',
  redTint: '#FBEAEA',
  amber: '#DDB000',
  amberDeep: '#6E5600',
  amberInk: '#4A3A00',
  amberTint: '#FFF6D6',
  amberLine: '#F2DE8C',
  hairline: 'rgba(33,35,32,0.07)',
  line: 'rgba(33,35,32,0.10)',
  fill: 'rgba(33,35,32,0.06)',
  scrim: 'rgba(33,35,32,0.45)',
  disabled: 'rgba(33,35,32,0.12)',
};

export const gradients = {
  screen: ['#FFFFFF', '#F6F6F2'] as const,
  orange: ['#FF9A33', '#FF8000', '#E66F00'] as const,
  orangeSoft: ['#FFB566', '#FF8000'] as const,
};

export const fonts = {
  display: 'Orbitron_700Bold',
  displayHeavy: 'Orbitron_800ExtraBold',
  displayMedium: 'Orbitron_600SemiBold',
  body: 'Outfit_400Regular',
  bodyMedium: 'Outfit_500Medium',
  bodySemi: 'Outfit_600SemiBold',
};

export const radius = { key: 20, card: 20, sheet: 28, pill: 999, tile: 18 };

function shadow(color: string, opacity: number, y: number, blur: number): ViewStyle {
  return Platform.select<ViewStyle>({
    web: { boxShadow: `0px ${y}px ${blur}px rgba(${color},${opacity})` } as ViewStyle,
    default: {
      shadowColor: color === '255,128,0' ? '#FF8000' : '#212320',
      shadowOpacity: opacity,
      shadowRadius: blur / 2,
      shadowOffset: { width: 0, height: y },
      elevation: Math.round(blur / 4),
    },
  })!;
}

export const shadows = {
  card: shadow('33,35,32', 0.05, 4, 12),
  raised: shadow('33,35,32', 0.12, 18, 40),
  primary: shadow('255,128,0', 0.28, 10, 24),
};

export const type = {
  eyebrow: { fontFamily: fonts.bodyMedium, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: colors.muted } as const,
  title: { fontFamily: fonts.display, fontSize: 28, color: colors.ink, letterSpacing: -0.5 } as const,
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.muted } as const,
  amount: { fontFamily: fonts.displayHeavy, fontSize: 56, letterSpacing: -1, color: colors.ink } as const,
};
