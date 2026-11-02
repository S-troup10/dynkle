import { type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { colors, gradients } from '@/theme';
import { styles } from './styles';

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
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, { top, height: '70%' }]}
    >
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
