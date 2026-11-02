import { useSyncExternalStore } from 'react';
import { log } from '@/lib/logger';

/** The terminal's log entries, re-rendering as new ones arrive. */
export function useLogs() {
  return useSyncExternalStore(log.subscribe, log.entries, log.entries);
}
