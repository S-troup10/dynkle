import { parseBleSenderMessage } from '@dynkle/shared';
import { api } from '@/api/client';
import { ble, type BleTxPower } from '@/native/hardware';
import { useUi } from '@/state/ui';
import { log } from './logger';

/**
 * DYNK app Tap to Pay over Bluetooth for one charge. The terminal is the receiver:
 * it serves a signed session from the dashboard, swaps it before it expires, and
 * passes what the phone says to the dashboard. It never decides "Paid": the
 * dashboard checks the chain (and watches it, in case a write here gets lost).
 */
export type TapToPayState = 'off' | 'starting' | 'waiting' | 'busy' | 'unavailable';

export interface TapToPayOptions {
  txPower?: BleTxPower;
  /** Retry delay when the dashboard can't be reached for a new session. */
  retryMs?: number;
}

export function startTapToPay(paymentId: string, opts: TapToPayOptions = {}): () => void {
  let stopped = false;
  let rotation: ReturnType<typeof setTimeout> | null = null;
  /** Once a phone says "processing", no more sessions: one customer per charge. */
  let paying = false;
  const setState = (s: TapToPayState) => !stopped && useUi.getState().setTapToPay(s);

  const report = (event: 'read' | 'processing' | 'failed' | 'disconnected', device: string, text?: string) =>
    api
      .bleEvent(paymentId, event, device, text ? (parseBleSenderMessage(text) ?? undefined) : undefined)
      .catch((e) => log.warn('Could not report Bluetooth event', { paymentId, event, error: e }));

  /** Swap in a fresh session while at least 15s are left on the current one: the phone rejects expired sessions. */
  const scheduleRotation = (expiresAt: number, minRemainingMs: number) => {
    if (rotation) clearTimeout(rotation);
    rotation = setTimeout(rotate, Math.max(1000, expiresAt - Date.now() - minRemainingMs));
  };

  const rotate = async () => {
    if (stopped || paying) return;
    try {
      const { session, wire, minRemainingMs } = await api.bleSession(paymentId);
      if (stopped || paying) return;
      ble.setSession(wire);
      scheduleRotation(session.e, minRemainingMs);
    } catch (e) {
      const status = (e as { status?: number }).status;
      // 409: the charge moved on (paid, someone paying, cancelled). Anything else: try again shortly.
      if (status === 409) return;
      log.warn('Could not rotate the Bluetooth session', { paymentId, error: e });
      rotation = setTimeout(rotate, opts.retryMs ?? 3000);
    }
  };

  const unsubscribe = ble.addListener({
    onRead: (device) => {
      log.info('Phone read the Tap to Pay session', { paymentId, device });
      void report('read', device);
    },
    onMessage: (device, text) => {
      const msg = parseBleSenderMessage(text);
      log.info('Phone wrote', { paymentId, device, status: msg?.transferStatus ?? 'unreadable', bytes: text.length });
      // Unreadable: ignore it; the dashboard's chain watcher still finds the payment.
      if (!msg) return;
      if (msg.transferStatus === 'processing') {
        paying = true;
        if (rotation) clearTimeout(rotation);
        ble.stopAdvertising();
        setState('busy');
        void report('processing', device, text);
      } else if (msg.transferStatus === 'confirmed' && msg.txSignature) {
        api
          .claimSignature(paymentId, msg.txSignature, device)
          .catch((e) =>
            log.warn('Could not hand the signature to the dashboard (the chain watcher will find it)', { paymentId, error: e }),
          );
      } else if (msg.transferStatus === 'failed') {
        void report('failed', device, text);
      }
    },
    onConnectionChange: (device, connected) => {
      if (!connected) void report('disconnected', device);
    },
    onError: (message) => log.warn('Bluetooth error', { paymentId, message }),
  });

  (async () => {
    if (ble.state() !== 'ready') {
      setState('unavailable');
      return;
    }
    setState('starting');
    try {
      const { session, wire, minRemainingMs } = await api.bleSession(paymentId);
      if (stopped) return;
      await ble.start(wire, opts.txPower ?? 'high');
      if (stopped) {
        ble.stop();
        return;
      }
      setState('waiting');
      log.info('Tap to Pay is live', { paymentId, simulated: ble.simulated });
      scheduleRotation(session.e, minRemainingMs);
    } catch (e) {
      log.warn('Tap to Pay could not start', { paymentId, error: e });
      setState('unavailable');
    }
  })();

  return () => {
    stopped = true;
    if (rotation) clearTimeout(rotation);
    unsubscribe();
    ble.stop();
    useUi.getState().setTapToPay('off');
  };
}
