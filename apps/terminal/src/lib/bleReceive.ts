import * as Crypto from 'expo-crypto';
import {
  BLE_DISPLAY_NAME_MAX,
  BLE_SESSION_MIN_REMAINING_MS,
  BLE_SESSION_TTL_MS,
  parseBleSenderMessage,
  serializeBleSession,
  type BleSessionV2,
  type PaymentSession,
} from '@dynkle/shared';
import { log } from '@/lib/logger';
import { ble, type BleTxPower } from '@/native/hardware';
import { useCheckout } from '@/state/checkout';
import { useUi } from '@/state/ui';
import { getReceivingAddress, signSessionNonce } from './bleWallet';

/**
 * DYNK app "Tap to Pay" over Bluetooth, received against this terminal's own
 * local wallet (see bleWallet.ts) rather than the dashboard — the real API
 * doesn't have the session/claim endpoints `tapToPay.ts` expects yet. This is
 * the minimum to prove the Bluetooth link end to end: it accepts the phone's
 * own "confirmed" write at face value and marks the charge paid. It does NOT
 * verify the amount, mint or recipient on chain — do that (see DYNK-app.md §2.4)
 * before trusting this for a real till, not just a test payment.
 */
export type BleReceiveState = 'off' | 'starting' | 'waiting' | 'busy' | 'unavailable';

async function buildSession(displayName: string): Promise<{ session: BleSessionV2; wire: string }> {
  const address = await getReceivingAddress();
  const n = Crypto.randomUUID();
  const e = Date.now() + BLE_SESSION_TTL_MS;
  const d = displayName.slice(0, BLE_DISPLAY_NAME_MAX);
  const s = await signSessionNonce(n);
  const session: BleSessionV2 = { v: 2, n, e, d, a: { SOL: address }, s };
  return { session, wire: serializeBleSession(session) };
}

export function startBleReceive(paymentId: string, displayName: string, opts: { txPower?: BleTxPower } = {}): () => void {
  let stopped = false;
  let rotation: ReturnType<typeof setTimeout> | null = null;
  /** Once a phone says "processing", no more sessions: one customer per charge. */
  let paying = false;
  const setState = (st: BleReceiveState) => !stopped && useUi.getState().setTapToPay(st);

  const scheduleRotation = (expiresAt: number) => {
    if (rotation) clearTimeout(rotation);
    rotation = setTimeout(rotate, Math.max(1000, expiresAt - Date.now() - BLE_SESSION_MIN_REMAINING_MS));
  };

  const rotate = async () => {
    if (stopped || paying) return;
    try {
      const { session, wire } = await buildSession(displayName);
      if (stopped || paying) return;
      ble.setSession(wire);
      scheduleRotation(session.e);
    } catch (e) {
      log.warn('Could not rotate the Bluetooth session', { paymentId, error: e });
      rotation = setTimeout(rotate, 3000);
    }
  };

  const applyStatus = (patch: Partial<PaymentSession>) => {
    const current = useCheckout.getState().payment;
    if (!current || current.id !== paymentId) return;
    useCheckout.getState().onStatus({ ...current, ...patch });
  };

  const unsubscribe = ble.addListener({
    onRead: (device) => log.info('Phone read the Bluetooth session', { paymentId, device }),
    onMessage: (device, text) => {
      const msg = parseBleSenderMessage(text);
      log.info('Phone wrote', { paymentId, device, status: msg?.transferStatus ?? 'unreadable' });
      if (!msg) return;
      if (msg.transferStatus === 'processing') {
        paying = true;
        if (rotation) clearTimeout(rotation);
        ble.stopAdvertising();
        setState('busy');
        applyStatus({ status: 'wallet_connected' });
      } else if (msg.transferStatus === 'confirmed' && msg.txSignature) {
        applyStatus({ status: 'paid', txSignature: msg.txSignature, completedAt: new Date().toISOString() });
      } else if (msg.transferStatus === 'failed') {
        applyStatus({ status: 'failed' });
      }
    },
    onConnectionChange: (device, connected) => {
      if (!connected) log.info('Phone disconnected', { paymentId, device });
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
      const { session, wire } = await buildSession(displayName);
      if (stopped) return;
      await ble.start(wire, opts.txPower ?? 'high');
      if (stopped) {
        ble.stop();
        return;
      }
      setState('waiting');
      log.info('Bluetooth receive is live', { paymentId, simulated: ble.simulated });
      scheduleRotation(session.e);
    } catch (e) {
      log.warn('Bluetooth receive could not start', { paymentId, error: e });
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
