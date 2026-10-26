import { type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius } from '@/theme';

/** Bottom sheet over a dimmed backdrop (size picker, unpair confirm). Rendered by a transparent modal route. */
export function Sheet({ children, onDismiss }: { children: ReactNode; onDismiss?: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]} onPress={onDismiss} accessibilityLabel="Dismiss" />
      <View style={[s.sheet, { paddingBottom: 20 + insets.bottom }]}>
        <View style={s.grabber} />
        {children}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: 20,
    paddingTop: 12,
    maxHeight: '88%',
  },
  grabber: { alignSelf: 'center', width: 44, height: 4, borderRadius: 2, backgroundColor: 'rgba(33,35,32,0.15)', marginBottom: 16 },
});
