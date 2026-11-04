import { useState, type ReactNode } from 'react';
import { PanResponder, View } from 'react-native';
import { router } from 'expo-router';
import { TABS } from './TabBar';

const PATHS: Record<string, string> = { keypad: '/keypad', items: '/items', activity: '/activity' };

/**
 * Horizontal swipe between the bottom tabs, in TABS order — React Navigation's
 * bottom-tabs don't support this themselves (unlike top tabs), so this wraps
 * each tab's root screen with its own gesture instead of a pager. Built on
 * PanResponder (core React Native, no extra native module) rather than
 * react-native-gesture-handler, to avoid another native dependency for this.
 */
export function SwipeTabs({ current, children }: { current: string; children: ReactNode }) {
  const index = TABS.findIndex((t) => t.name === current);
  const [responder] = useState(() =>
    PanResponder.create({
      // Only claim the gesture once it's clearly a horizontal swipe, so vertical
      // scrolling and ordinary taps on buttons underneath aren't affected.
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 20 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
      onPanResponderRelease: (_e, g) => {
        if (Math.abs(g.dx) < 60) return;
        const next = index + (g.dx < 0 ? 1 : -1);
        if (next < 0 || next >= TABS.length) return;
        router.navigate(PATHS[TABS[next].name] as never);
      },
    }),
  );
  return (
    <View style={{ flex: 1 }} {...responder.panHandlers}>
      {children}
    </View>
  );
}
