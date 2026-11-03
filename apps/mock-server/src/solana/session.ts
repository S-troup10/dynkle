import { randomUUID } from 'node:crypto';
import bs58 from 'bs58';
import {
  BLE_DISPLAY_NAME_MAX,
  BLE_MAX_PAYLOAD_BYTES,
  BLE_SESSION_TTL_MS,
  serializeBleSession,
  utf8ByteLength,
  type BleSessionV2,
} from '@dynkle/shared';
import type { MerchantWallet } from './wallet';

export interface IssuedSession {
  session: BleSessionV2;
  /** The exact bytes (as UTF-8 text) the terminal serves on READ. */
  wire: string;
}

/** A fresh, single-use v2 session (spec §2.3). Never reuse a nonce. */
export function issueSession(wallet: MerchantWallet, displayName: string, now = Date.now(), ttlMs = BLE_SESSION_TTL_MS): IssuedSession {
  const n = randomUUID();
  const s = wallet.sign ? bs58.encode(wallet.sign(new TextEncoder().encode(n))) : undefined;
  const build = (d: string): IssuedSession => {
    const session: BleSessionV2 = { v: 2, n, e: now + ttlMs, d, a: { SOL: wallet.address }, ...(s ? { s } : {}) };
    return { session, wire: serializeBleSession(session) };
  };
  // Same fallback as the app: 24 characters, then 8 if the payload is still too big.
  let issued = build(displayName.slice(0, BLE_DISPLAY_NAME_MAX));
  if (utf8ByteLength(issued.wire) > BLE_MAX_PAYLOAD_BYTES) issued = build(displayName.slice(0, 8));
  if (utf8ByteLength(issued.wire) > BLE_MAX_PAYLOAD_BYTES) throw new Error('Bluetooth session is larger than 480 bytes');
  return issued;
}
