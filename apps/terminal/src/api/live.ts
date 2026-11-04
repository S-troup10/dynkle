import type { PaymentSession } from '@dynkle/shared';
import type { QueryClient } from '@tanstack/react-query';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { APP_VERSION } from '@/lib/config';
import { log } from '@/lib/logger';
import { useSession } from '@/state/session';
import { useCheckout } from '@/state/checkout';
import { useUi } from '@/state/ui';
import { newRequestId } from './client';
import { mapOrderStatus } from './mapping';

/**
 * The Dynkle API's device socket (src/devices/deviceHub.js, mounted at
 * /ws/terminal) uses a different protocol than the old dashboard socket: the
 * *device* sends HEARTBEATs (the server only answers them), and a handful of
 * message types carry the order lifecycle instead of one `payment.status`
 * event. See deviceHub.js's `onDeviceMessage`/`sendToCounter` for the server
 * side of this.
 */

interface DeviceMessage {
  v?: number;
  type: string;
  id?: string;
  ts?: number;
  payload?: Record<string, unknown>;
}

export const SILENCE_TIMEOUT_MS = 45_000;
const HEARTBEAT_INTERVAL_MS = 20_000;
const MAX_BACKOFF_MS = 10_000;

export interface LiveOptions {
  silenceTimeoutMs?: number;
  /** Subscribe to network/app-state changes (off in tests). */
  watchDevice?: boolean;
}

/** Routes one device-socket message into the stores. */
export function handleDeviceMessage(msg: DeviceMessage, queryClient: QueryClient) {
  const p = msg.payload ?? {};
  switch (msg.type) {
    case 'CONFIG': {
      const profile = useSession.getState().profile;
      if (!profile) break;
      useSession.getState().setProfile({
        ...profile,
        merchant: { ...profile.merchant, name: (p.merchantName as string) ?? profile.merchant.name },
      });
      break;
    }
    case 'ARM': {
      const current = useCheckout.getState().payment;
      const orderId = p.orderId as string;
      if (current && current.id === orderId) break; // this device armed it itself over HTTP already
      const items = Array.isArray(p.items) ? (p.items as { name: string; price: number | null; qty: number }[]) : [];
      const totalCents = Number(p.totalCents) || 0;
      const payment: PaymentSession = {
        id: orderId,
        tillId: useSession.getState().profile?.till.id ?? '',
        status: 'armed',
        source: 'dashboard',
        lines: items.map((it, i) => ({
          id: `${orderId}-${i}`,
          kind: 'custom',
          name: it.name,
          detail: '',
          unitCents: it.price != null ? Math.round(it.price * 100) : 0,
          qty: it.qty,
        })),
        subtotalCents: totalCents,
        tipCents: 0,
        totalCents,
        gstCents: 0,
        customerFeeCents: 0,
        createdAt: new Date().toISOString(),
        expiresAt: (p.expiresAt as string) ?? new Date(Date.now() + 90_000).toISOString(),
        qrUrl: (p.paymentUrl as string) ?? '',
        ndefUrl: (p.paymentUrl as string) ?? '',
        solanaPayUrl: (p.paymentUrl as string) ?? '',
      };
      useCheckout.getState().beginRemote(payment);
      break;
    }
    case 'DISARM': {
      const current = useCheckout.getState().payment;
      if (!current || current.id !== p.orderId) break;
      const expired = typeof p.reason === 'string' && p.reason.toUpperCase().includes('EXPIR');
      useCheckout.getState().onStatus({ ...current, status: expired ? 'expired' : 'cancelled' });
      break;
    }
    case 'ORDER_STATUS': {
      const current = useCheckout.getState().payment;
      if (!current || current.id !== p.orderId) break;
      const status = mapOrderStatus(p.status as never);
      useCheckout.getState().onStatus({
        ...current,
        status,
        totalCents: typeof p.totalCents === 'number' ? p.totalCents : current.totalCents,
        txSignature: (p.txHash as string) ?? current.txSignature,
        completedAt: status === 'paid' ? new Date().toISOString() : current.completedAt,
      });
      if (status === 'paid' || status === 'failed' || status === 'expired') {
        queryClient.invalidateQueries({ queryKey: ['transactions'] });
      }
      break;
    }
    case 'CUSTOMER_TAPPED': {
      const current = useCheckout.getState().payment;
      if (current && current.id === p.orderId && current.status === 'armed') {
        useCheckout.getState().onStatus({ ...current, status: 'wallet_connected' });
      }
      break;
    }
    case 'REVOKED':
      log.warn('This device was revoked');
      useSession.getState().markUnpaired();
      break;
    default:
      break;
  }
}

/**
 * One WebSocket per paired device. Reconnects with backoff, sends the
 * HELLO/HEARTBEAT handshake the device socket expects, and treats silence as
 * a dead connection — proxies and flaky WiFi can drop it without either end
 * being told.
 */
export function startLiveConnection(queryClient: QueryClient, opts: LiveOptions = {}): () => void {
  const silenceMs = opts.silenceTimeoutMs ?? SILENCE_TIMEOUT_MS;
  let ws: WebSocket | null = null;
  let stopped = false;
  let attemptN = 0;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let watchdog: ReturnType<typeof setTimeout> | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const clearTimers = () => {
    if (retry) clearTimeout(retry);
    if (watchdog) clearTimeout(watchdog);
    if (heartbeat) clearInterval(heartbeat);
    retry = watchdog = heartbeat = null;
  };

  const send = (type: string, payload: Record<string, unknown> = {}) => {
    if (ws?.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ v: 2, type, id: newRequestId(), ts: Date.now(), payload }));
  };

  /** Drop the current socket without waiting for its close event (which may never come). */
  const drop = (reason: string) => {
    if (watchdog) clearTimeout(watchdog);
    if (heartbeat) clearInterval(heartbeat);
    watchdog = heartbeat = null;
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
    log.warn('Dashboard connection lost', { reason, attempt: attemptN });
    useUi.getState().setSocket('closed');
    scheduleReconnect();
  };

  const armWatchdog = () => {
    if (watchdog) clearTimeout(watchdog);
    watchdog = setTimeout(() => drop('no heartbeat'), silenceMs);
  };

  const scheduleReconnect = (delay = Math.min(MAX_BACKOFF_MS, 500 * 2 ** attemptN++)) => {
    if (retry) clearTimeout(retry);
    retry = setTimeout(connect, delay);
  };

  const connect = () => {
    clearTimers();
    const { apiUrl, token } = useSession.getState();
    if (stopped || !token) return;
    useUi.getState().setSocket('connecting');
    const socket = new WebSocket(`${apiUrl.replace(/^http/, 'ws')}/ws/terminal?token=${encodeURIComponent(token)}`);
    ws = socket;
    armWatchdog();
    socket.onopen = () => {
      if (attemptN > 0) log.info('Dashboard connection restored', { attempts: attemptN });
      attemptN = 0;
      useUi.getState().setSocket('open');
      send('HELLO', { appVersion: APP_VERSION });
      heartbeat = setInterval(() => send('HEARTBEAT'), HEARTBEAT_INTERVAL_MS);
      // Catch up on anything missed while disconnected, including the sale on screen.
      queryClient.invalidateQueries();
      useCheckout.getState().refresh();
    };
    socket.onmessage = (m) => {
      armWatchdog();
      try {
        const msg = JSON.parse(String(m.data)) as DeviceMessage;
        if (msg.id) send('ACK', {});
        handleDeviceMessage(msg, queryClient);
      } catch {
        // Ignore malformed frames.
      }
    };
    socket.onclose = () => drop('closed');
  };

  /** The network or the app just came back: don't sit out the backoff, try now. */
  const kick = () => {
    if (stopped || ws) return;
    attemptN = 0;
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
