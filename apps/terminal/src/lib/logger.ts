import type { LogEntry } from '@dynkle/shared';
import { storage } from './storage';

/**
 * The terminal's own log: a ring buffer of recent events, saved on the device
 * so it survives restarts. Admin → Logs shows it and "Send logs to support"
 * uploads it to the dashboard.
 */

export type LogLevel = LogEntry['level'];

const KEY = 'dynkle.logs';
const MAX_ENTRIES = 300;
const SAVE_DELAY_MS = 1000;

let entries: LogEntry[] = [];
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    storage.set(KEY, entries);
  }, SAVE_DELAY_MS);
  // Under Node (tests) a pending save mustn't keep the process alive. RN timers have no unref.
  (saveTimer as { unref?: () => void }).unref?.();
}

/** Keeps context small and serialisable: errors become their message, long strings are cut. */
function clean(context?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!context) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(context)) {
    if (v instanceof Error) out[k] = v.message;
    else if (typeof v === 'string') out[k] = v.length > 300 ? `${v.slice(0, 300)}…` : v;
    else if (v === undefined || typeof v === 'function') continue;
    else out[k] = v;
  }
  return out;
}

function write(level: LogLevel, message: string, context?: Record<string, unknown>) {
  const entry: LogEntry = { at: new Date().toISOString(), level, message: message.slice(0, 2000), context: clean(context) };
  entries = [...entries.slice(-(MAX_ENTRIES - 1)), entry];
  if (__DEV__ && process.env.NODE_ENV !== 'test') {
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    fn(`[${level}] ${message}`, entry.context ?? '');
  }
  save();
  for (const l of listeners) l();
}

export const log = {
  debug: (message: string, context?: Record<string, unknown>) => write('debug', message, context),
  info: (message: string, context?: Record<string, unknown>) => write('info', message, context),
  warn: (message: string, context?: Record<string, unknown>) => write('warn', message, context),
  error: (message: string, context?: Record<string, unknown>) => write('error', message, context),

  /** Load what was saved before the last restart (newer entries written since boot are kept). */
  async hydrate() {
    const saved = (await storage.get<LogEntry[]>(KEY)) ?? [];
    entries = [...saved, ...entries].slice(-MAX_ENTRIES);
    for (const l of listeners) l();
  },
  entries: (): readonly LogEntry[] => entries,
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  clear() {
    entries = [];
    storage.set(KEY, null);
    for (const l of listeners) l();
  },
};

/** Report errors React Native would otherwise only show in a red box (or swallow in release builds). */
export function installGlobalErrorHandler() {
  const g = globalThis as unknown as {
    ErrorUtils?: {
      getGlobalHandler(): (error: Error, isFatal?: boolean) => void;
      setGlobalHandler(fn: (error: Error, isFatal?: boolean) => void): void;
    };
  };
  const utils = g.ErrorUtils;
  if (!utils) return;
  const previous = utils.getGlobalHandler();
  utils.setGlobalHandler((error, isFatal) => {
    log.error(isFatal ? 'Fatal error' : 'Unhandled error', { error, stack: error?.stack });
    // Save straight away: a fatal error is about to take the app down.
    storage.set(KEY, entries);
    previous(error, isFatal);
  });
}
