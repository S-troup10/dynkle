import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, type GestureResponderEvent, type StyleProp, type ViewStyle } from 'react-native';

/**
 * Shared, dependency-free motion built on RN's own `Animated` (native driver): no
 * Reanimated, so no native rebuild is needed to use any of this.
 */

/** Fades and lifts content in on mount. Pass a `replayKey` that changes (e.g. the
 * checkout state) to play it again instead of just once. */
export function FadeInUp({
  children,
  delay = 0,
  distance = 8,
  duration = 180,
  style,
  replayKey,
}: {
  children: ReactNode;
  delay?: number;
  distance?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
  replayKey?: string | number;
}) {
  const [progress] = useState(() => new Animated.Value(0));
  useEffect(() => {
    progress.setValue(0);
    const anim = Animated.timing(progress, { toValue: 1, duration, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    anim.start();
    return () => anim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replayKey]);
  return (
    <Animated.View
      style={[
        style,
        { opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) }] },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/** Scales and fades in with a light overshoot — for a result badge (paid, failed, expired). */
export function PopIn({ children, delay = 0, style }: { children: ReactNode; delay?: number; style?: StyleProp<ViewStyle> }) {
  const [progress] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const anim = Animated.spring(progress, { toValue: 1, delay, friction: 9, tension: 220, useNativeDriver: true });
    anim.start();
    return () => anim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <Animated.View style={[style, { opacity: progress, transform: [{ scale: progress }] }]}>{children}</Animated.View>;
}

/** A slow, gentle breathing scale — for something waiting on the customer. */
export function Pulse({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const [progress] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, { toValue: 1, duration: 750, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(progress, { toValue: 0, duration: 750, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [progress]);
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1] }),
          transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/**
 * Spring-based press feedback for a custom `Pressable`: spread `handlers` onto it and
 * wrap its content in an `Animated.View` using `style`. Replaces an instant
 * `pressed && {transform:[{scale}]}` jump with a settling spring, both ways.
 */
export function usePressScale(scale = 0.96) {
  const [value] = useState(() => new Animated.Value(1));
  const animateTo = (toValue: number) => Animated.spring(value, { toValue, friction: 11, tension: 320, useNativeDriver: true }).start();
  const handlers = {
    onPressIn: (_e: GestureResponderEvent) => animateTo(scale),
    onPressOut: (_e: GestureResponderEvent) => animateTo(1),
  };
  return { style: { transform: [{ scale: value }] }, handlers };
}
