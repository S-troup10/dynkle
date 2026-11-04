import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { usePressScale } from '@/components/ui/motion';
import { haptics } from '@/lib/haptics';
import { colors, cs, fonts, radius, shadows } from '@/theme';
import { Icon } from './Icon';

const MONEY_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'del'];
const PIN_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

export function Keypad({
  onKey,
  mode = 'money',
  keyHeight = 66,
  disabled,
}: {
  onKey: (key: string) => void;
  mode?: 'money' | 'pin';
  keyHeight?: number;
  disabled?: boolean;
}) {
  const keys = mode === 'money' ? MONEY_KEYS : PIN_KEYS;
  const rows = [0, 3, 6, 9].map((i) => keys.slice(i, i + 3));
  return (
    <View style={s.grid}>
      {rows.map((row, r) => (
        <View key={r} style={s.row}>
          {row.map((k, i) =>
            k === '' ? (
              <View key={`blank-${i}`} style={[s.cell, { height: keyHeight }]} />
            ) : (
              <Key key={k} k={k} mode={mode} keyHeight={keyHeight} disabled={disabled} onKey={onKey} />
            ),
          )}
        </View>
      ))}
    </View>
  );
}

function Key({
  k,
  mode,
  keyHeight,
  disabled,
  onKey,
}: {
  k: string;
  mode: 'money' | 'pin';
  keyHeight: number;
  disabled?: boolean;
  onKey: (key: string) => void;
}) {
  const { style: pressStyle, handlers } = usePressScale(0.93);
  return (
    <Pressable
      onPress={() => {
        haptics.tap();
        onKey(k);
      }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={k === 'del' ? 'Delete' : k === '00' ? 'Double zero' : k}
      accessibilityState={{ disabled: !!disabled }}
      testID={`key-${k}`}
      style={[s.cell, { height: keyHeight }]}
      {...handlers}
    >
      <Animated.View style={[s.key, { height: keyHeight }, pressStyle]}>
        {k === 'del' ? (
          mode === 'pin' ? (
            <Text style={s.delText}>Del</Text>
          ) : (
            <Icon name="backspace" size={26} strokeWidth={2} />
          )
        ) : (
          <Text style={s.keyText}>{k}</Text>
        )}
      </Animated.View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  grid: { gap: cs(10, 6) },
  row: { flexDirection: 'row', gap: cs(10, 6) },
  cell: { flex: 1 },
  key: {
    borderRadius: radius.key,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  keyText: { fontFamily: fonts.display, fontSize: cs(24, 20), color: colors.ink },
  delText: { fontFamily: fonts.bodySemi, fontSize: cs(17, 15), color: colors.ink },
});
