import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

/** Best-effort touch feedback. Not on web, and never allowed to throw into a caller mid-sale. */
function run(fn: () => Promise<void>) {
  if (Platform.OS === 'web') return;
  fn().catch(() => undefined);
}

export const haptics = {
  /** A key, a button, a stepper — any ordinary tap. */
  tap: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  success: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
