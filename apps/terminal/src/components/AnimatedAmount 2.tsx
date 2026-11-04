import { useEffect, useRef, useState } from 'react';
import { Animated, type StyleProp, type TextStyle } from 'react-native';

/**
 * A single Text node (same layout behaviour as a plain amount display) that pops
 * with a quick spring whenever its value changes, so typing on the keypad reads as
 * the amount bouncing into place rather than just snapping to the new number.
 */
export function AnimatedAmount({
  value,
  style,
  testID,
}: {
  value: string;
  style?: StyleProp<TextStyle>;
  testID?: string;
}) {
  const [progress] = useState(() => new Animated.Value(1));
  const prevValue = useRef(value);

  useEffect(() => {
    if (prevValue.current === value) return;
    prevValue.current = value;
    progress.setValue(0.88);
    Animated.spring(progress, { toValue: 1, friction: 6, tension: 260, useNativeDriver: true }).start();
  }, [value, progress]);

  return (
    <Animated.Text
      maxFontSizeMultiplier={1.3}
      numberOfLines={1}
      adjustsFontSizeToFit
      style={[style, { transform: [{ scale: progress }] }]}
      testID={testID}
    >
      {value}
    </Animated.Text>
  );
}
