import { useEffect } from 'react';
import { router } from 'expo-router';
import { useUi } from '@/state/ui';
import { useCountdown } from './useCountdown';

export const ADMIN_UNLOCK_MS = 2 * 60_000;

/** Admin screens stay unlocked for two minutes, then bounce back to Settings. */
export function useAdminGuard(): number {
  const until = useUi((s) => s.adminUnlockedUntil);
  const left = useCountdown(until);
  useEffect(() => {
    if (until <= Date.now() || left <= 0) {
      useUi.getState().lockAdmin();
      if (router.canDismiss()) router.dismissTo('/settings');
      else router.replace('/settings');
    }
  }, [left, until]);
  return left;
}

/** Any admin action counts as activity and restarts the lock timer. */
export function touchAdmin() {
  useUi.getState().unlockAdmin(ADMIN_UNLOCK_MS);
}
