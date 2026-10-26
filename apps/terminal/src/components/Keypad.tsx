import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, shadows } from '@/theme';
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
              <Pressable
                key={k}
                onPress={() => onKey(k)}
                disabled={disabled}
                accessibilityLabel={k === 'del' ? 'Delete' : k}
                testID={`key-${k}`}
                style={({ pressed }) => [s.cell, s.key, { height: keyHeight }, pressed && { backgroundColor: colors.orangeTint }]}
              >
                {k === 'del' ? (
                  mode === 'pin' ? (
                    <Text style={s.delText}>Del</Text>
                  ) : (
                    <Icon name="backspace" size={26} strokeWidth={2} />
                  )
                ) : (
                  <Text style={s.keyText}>{k}</Text>
                )}
              </Pressable>
            ),
          )}
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  grid: { gap: 10 },
  row: { flexDirection: 'row', gap: 10 },
  cell: { flex: 1 },
  key: {
    borderRadius: radius.key,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  keyText: { fontFamily: fonts.display, fontSize: 24, color: colors.ink },
  delText: { fontFamily: fonts.bodySemi, fontSize: 17, color: colors.ink },
});
