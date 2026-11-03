import type { ServerEvent } from '@dynkle/shared';
import type { QueryClient } from '@tanstack/react-query';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { log } from '@/lib/logger';
import { ble } from '@/native/hardware';
import { useSession } from '@/state/session';
import { useCheckout } from '@/state/checkout';
import { useUi } from '@/state/ui';

/** The dashboard sends a heartbeat every 20s. Hearing nothing for this long means the socket is dead. */
export const SILENCE_TIMEOUT_MS = 45_000;
const MAX_BACKOFF_MS = 10_000;

export interface LiveOptions {
  silenceTimeoutMs?: number;
  /** Subscribe to network/app-state changes (off in tests). */
  watchDevice?: boolean;
}

/** Routes one dashboard event into the stores. */
export function handleServerEvent(event: ServerEvent, queryClient: QueryClient) {
  switch (event.type) {
    case 'payment.status':
      useCheckout.getState().onStatus(event.payment);
      if (['paid', 'failed', 'expired'].includes(event.payment.status)) {
        queryClient.invalidateQueries({ queryKey: ['transactions'] });
      }
      break;
    case 'remote_charge':
      log.info('Dashboard charge received', { chargeId: event.charge.id, amountCents: event.charge.amountCents });
      useCheckout.getState().receiveIncoming(event.charge);
      break;
    case 'catalog.updated':
      queryClient.setQueryData(['catalog'], event.catalog);
      break;
    case 'settings.updated':
      useSession.getState().setProfile(event.profile);
      break;
    case 'terminal.unpaired':
      log.warn('Dashboard unpaired this terminal');
      useSession.getState().markUnpaired();
      break;
    case 'software_update':
      useUi.getState().setUpdate(event.version);
      break;
    case 'heartbeat':
      break;
    case 'dev.ble':
      // Web preview: the dev panel's pretend DYNK phone tapping the simulated Bluetooth peripheral.
      ble.simulate(event);
      break;
  }
}

/**
 * One WebSocket per paired terminal. Reconnects with backoff, routes dashboard
 * events into the stores, and treats a silent socket as dead: proxies and flaky
 * WiFi can drop a connection without either end being told.
 */
export function startLiveConnection(queryClient: QueryClient, opts: LiveOptions = {}): () => void {
  const silenceMs = opts.silenceTimeoutMs ?? SILENCE_TIMEOUT_MS;
  let ws: WebSocket | null = null;
  let stopped = false;
  let attempt = 0;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let watchdog: ReturnType<typeof setTimeout> | null = null;

  const clearTimers = () => {
    if (retry) clearTimeout(retry);
    if (watchdog) clearTimeout(watchdog);
    retry = watchdog = null;
  };

  /** Drop the current socket without waiting for its close event (which may never come). */
  const drop = (reason: string) => {
    if (watchdog) clearTimeout(watchdog);
    watchdog = null;
    const old = ws;
    ws = null;
    if (old) {
      old.onopen = old.onmessage = old.onclose = old.onerror = null;
      try {
        old.close();
      } catch {
        // Already closed.
      }
    }
    if (stopped) return;
    log.warn('Dashboard connection lost', { reason, attempt });
    useUi.getState().setSocket('closed');
    scheduleReconnect();
  };

  const armWatchdog = () => {
    if (watchdog) clearTimeout(watchdog);
    watchdog = setTimeout(() => drop('no heartbeat'), silenceMs);
  };

  const scheduleReconnect = (delay = Math.min(MAX_BACKOFF_MS, 500 * 2 ** attempt++)) => {
    if (retry) clearTimeout(retry);
    retry = setTimeout(connect, delay);
  };

  const connect = () => {
    clearTimers();
    const { apiUrl, token } = useSession.getState();
    if (stopped || !token) return;
    useUi.getState().setSocket('connecting');
    const socket = new WebSocket(`${apiUrl.replace(/^http/, 'ws')}/ws?token=${encodeURIComponent(token)}`);
    ws = socket;
    armWatchdog();
    socket.onopen = () => {
      if (attempt > 0) log.info('Dashboard connection restored', { attempts: attempt });
      attempt = 0;
      useUi.getState().setSocket('open');
      // Catch up on anything missed while disconnected, including the sale on screen.
      queryClient.invalidateQueries();
      useCheckout.getState().refresh();
    };
    socket.onmessage = (m) => {
      armWatchdog();
      try {
        handleServerEvent(JSON.parse(String(m.data)) as ServerEvent, queryClient);
      } catch {
        // Ignore malformed frames.
      }
    };
    socket.onclose = () => drop('closed');
  };

  /** The network or the app just came back: don't sit out the backoff, try now. */
  const kick = () => {
    if (stopped || ws) return;
    attempt = 0;
    scheduleReconnect(0);
  };

  const unsubscribers: (() => void)[] = [];
  if (opts.watchDevice ?? true) {
    let wasConnected = true;
    unsubscribers.push(
      NetInfo.addEventListener((s) => {
        const connected = s.isConnected !== false;
        if (connected && !wasConnected) kick();
        wasConnected = connected;
      }),
    );
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') kick();
    });
    unsubscribers.push(() => sub.remove());
  }

  connect();
  return () => {
    stopped = true;
    clearTimers();
    for (const u of unsubscribers) u();
    drop('stopped');
    useUi.getState().setSocket('closed');
  };
}
