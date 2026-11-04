import bs58 from 'bs58';
import nacl from 'tweetnacl';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { fromBase64, toBase64 } from './base64';

/**
 * This terminal's own Solana keypair, used only for Bluetooth Tap to Pay (the
 * session the DYNK app reads must be signed by the key behind the `SOL` address
 * it advertises — see DYNK-app.md §1.4/§2.3). This is a *local test receiving
 * wallet*: there's no merchant wallet wired up yet, so payments land here, not
 * in the merchant's own account. Swap this for the merchant's real address (and
 * move signing server-side) before relying on it for anything but testing.
 *
 * ed25519 signing is deterministic (no randomness needed at sign time), so the
 * only randomness this needs is the one-time 32-byte seed, from expo-crypto.
 */

const SEED_KEY = 'dynkle.ble.seed';

let cached: nacl.SignKeyPair | null = null;

async function loadOrCreateSeed(): Promise<Uint8Array> {
  const stored = await SecureStore.getItemAsync(SEED_KEY);
  if (stored) return fromBase64(stored);
  const seed = Crypto.getRandomBytes(32);
  await SecureStore.setItemAsync(SEED_KEY, toBase64(seed));
  return seed;
}

async function getKeyPair(): Promise<nacl.SignKeyPair> {
  if (!cached) cached = nacl.sign.keyPair.fromSeed(await loadOrCreateSeed());
  return cached;
}

/** Base58 Solana address the terminal advertises as `a.SOL` in the BLE session. */
export async function getReceivingAddress(): Promise<string> {
  const kp = await getKeyPair();
  return bs58.encode(kp.publicKey);
}

/** bs58 ed25519 signature of the UTF-8 bytes of the session nonce, for the session's `s` field. */
export async function signSessionNonce(nonce: string): Promise<string> {
  const kp = await getKeyPair();
  const sig = nacl.sign.detached(new TextEncoder().encode(nonce), kp.secretKey);
  return bs58.encode(sig);
}
