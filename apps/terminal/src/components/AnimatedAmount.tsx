import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';

/**
 * Each character rolls vertically only when ITS value actually changes — typing a
 * digit shifts the existing ones (cents*10 + digit), which is a right-aligned
 * shift, so each slot is keyed by its distance from the right edge of the string
 * rather than its left-to-right index. That keeps the same slot's component
 * identity stable across renders as the string grows, so React (and the ref this
 * uses to notice a change) only sees a prop change on the digits that actually
 * moved — the rest just sit still as plain text.
 *
 * One known, accepted trade-off: the slot nearest the "$" briefly rolls FROM the
 * "$" the moment the integer part gains a digit (e.g. $9.99 -> $10.00), since the
 * "$" and that digit swap which distance-from-right they occupy. Rare, cosmetic,
 * not worth a fuller sign-aware diff for a POS keypad.
 */

/**
 * A fixed width per character, not measured per instance — measuring each glyph
 * in isolation drops the kerning it'd normally get sitting next to its neighbours
 * in one run of text, which is what made digits look unevenly spaced. A flat,
 * slightly generous width per character class reads as even and intentional,
 * the way an odometer or a ticket counter's digits do.
 */
function slotWidth(char: string, fontSize: number): number {
  if (char === '.' || char === ',') return fontSize * 0.3;
  return fontSize * 0.62;
}

function RollingChar({ char, style }: { char: string; style?: StyleProp<TextStyle> }) {
  const flat = StyleSheet.flatten(style) as TextStyle | undefined;
  const fontSize = typeof flat?.fontSize === 'number' ? flat.fontSize : 40;
  const height = Math.ceil(fontSize * 1.2);
  const width = Math.ceil(slotWidth(char, fontSize));

  const [settled, setSettled] = useState(char);
  const [pair, setPair] = useState<{ next: string; prev: string } | null>(null);
  const [progress] = useState(() => new Animated.Value(1));
  const lastSeen = useRef(char);

  useEffect(() => {
    if (lastSeen.current === char) return;
    const prev = lastSeen.current;
    lastSeen.current = char;
    setPair({ next: char, prev });
    progress.setValue(0);
    Animated.timing(progress, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(
      ({ finished }) => {
        if (finished) {
          setSettled(char);
          setPair(null);
        }
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [char]);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [-height, 0] });
  const centered: StyleProp<TextStyle> = [style, { width, textAlign: 'center' }];

  return (
    <View style={{ height, width, overflow: 'hidden' }}>
      <Animated.View style={{ transform: [{ translateY }] }}>
        <Text style={centered}>{pair ? pair.next : settled}</Text>
        {pair ? <Text style={centered}>{pair.prev}</Text> : null}
      </Animated.View>
    </View>
  );
}

export function AnimatedAmount({
  value,
  style,
  testID,
}: {
  value: string;
  style?: StyleProp<TextStyle>;
  testID?: string;
}) {
  const chars = value.split('');
  const n = chars.length;
  return (
    <View style={{ flexDirection: 'row' }} testID={testID}>
      {chars.map((char, i) => (
        <RollingChar key={n - 1 - i} char={char} style={style} />
      ))}
    </View>
  );
}
