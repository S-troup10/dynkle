import { useEffect, useState } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '@/theme';

/** Orange arc spinner used for "in progress" steps and the processing ring. */
export function Spinner({ size = 24, stroke = 2.5, color = colors.orange, track = colors.orangeGlow }: {
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
}) {
  const [spin] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <View style={{ width: size, height: size }}>
      <Animated.View style={{ transform: [{ rotate }] }}>
        <Svg width={size} height={size}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={`${c * 0.3} ${c}`}
            strokeLinecap="round"
          />
        </Svg>
      </Animated.View>
    </View>
  );
}
