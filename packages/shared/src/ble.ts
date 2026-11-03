import { z } from 'zod';

/**
 * DYNK app "Tap to Pay" over Bluetooth LE (not NFC).
 *
 * The terminal is the *receiver*: a GATT server serving a small signed JSON
 * session. The customer's DYNK app is the *sender*: it connects when the phones
 * touch (RSSI >= -50 dBm), reads the session, pays on chain itself, and writes
 * status messages back. These values must match the DYNK app byte for byte
 * (app repo: src/services/ble/bleTypes.ts).
 */

export const BLE_SERVICE_UUID = '7a1e8f10-7a2c-4b7e-9b7a-1f6a2e6b9c10';
export const BLE_SESSION_CHARACTERISTIC_UUID = '7a1e8f11-7a2c-4b7e-9b7a-1f6a2e6b9c10';
/** Android GATT reads stop at 512 bytes; the app enforces 480. */
export const BLE_MAX_PAYLOAD_BYTES = 480;
/** The app's own session lifetime. */
export const BLE_SESSION_TTL_MS = 60_000;
/** Rotate the session when less than this is left, so a phone never reads an expired one. */
export const BLE_SESSION_MIN_REMAINING_MS = 15_000;
/** Display names longer than this are cut (the app does the same). */
export const BLE_DISPLAY_NAME_MAX = 24;

/** Session payload, version 2 (what the terminal serves on READ). */
export interface BleSessionV2 {
  v: 2;
  /** Nonce = session id (UUID v4). Single use: the phone rejects one it has seen. */
  n: string;
  /** Expiry, unix ms. */
  e: number;
  /** Display name shown to the payer. */
  d: string;
  /** Receiving address per account family. Dynkle only needs SOL. */
  a: { SOL: string };
  /** bs58 ed25519 signature of the UTF-8 bytes of `n` by the `a.SOL` key. Omit = phone asks the customer to confirm. */
  s?: string;
}

/** Serialised exactly as served: compact JSON, no whitespace. */
export function serializeBleSession(session: BleSessionV2): string {
  const { v, n, e, d, a, s } = session;
  return JSON.stringify(s === undefined ? { v, n, e, d, a } : { v, n, e, d, a, s });
}

export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** Messages the DYNK app writes back to the receiver (UTF-8 JSON). These are the sender's claims: display only. */
export const bleSenderMessageSchema = z
  .object({
    transferStatus: z.enum(['processing', 'confirmed', 'failed']),
    txSignature: z.string().max(128).optional(),
    amount: z.string().max(64).optional(),
    symbol: z.string().max(16).optional(),
    chainId: z.string().max(64).optional(),
    recipientAddress: z.string().max(64).optional(),
    senderAddress: z.string().max(64).optional(),
    fiatAmount: z.string().max(32).optional(),
    fiatAmountUsd: z.number().optional(),
    currencyCode: z.string().max(8).optional(),
    networkFee: z.string().max(32).optional(),
    networkFeeSymbol: z.string().max(16).optional(),
  })
  .passthrough();

export type BleSenderMessage = z.infer<typeof bleSenderMessageSchema>;

/** Parses a write from the phone. Returns null for anything that isn't a valid message (rely on the chain watcher then). */
export function parseBleSenderMessage(text: string): BleSenderMessage | null {
  try {
    const result = bleSenderMessageSchema.safeParse(JSON.parse(text));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/** What the terminal reports to the dashboard as the Bluetooth exchange progresses. */
export const bleEventSchema = z.object({
  event: z.enum(['read', 'processing', 'failed', 'disconnected']),
  /** Bluetooth address of the phone (for logs only). */
  device: z.string().max(64).optional(),
  /** The phone's message as received, for display/logs. Never trusted for payment state. */
  message: bleSenderMessageSchema.optional(),
});

export const claimSignatureSchema = z.object({
  txSignature: z.string().min(32).max(128),
  device: z.string().max(64).optional(),
});

export const devBleTapSchema = z.object({
  /** Amount the simulated customer types, in token units. Defaults to the quoted amount. */
  amount: z.string().max(64).optional(),
  /** Which token the customer sends. DYNK by default; SOL simulates paying the wrong token. */
  token: z.enum(['DYNK', 'SOL']).optional(),
  /** Simulate the phone's "confirmed" write getting lost: only the chain watcher can find the payment. */
  dropConfirmedWrite: z.boolean().optional(),
  /** Simulate the transfer failing in the customer's wallet. */
  fail: z.boolean().optional(),
});
