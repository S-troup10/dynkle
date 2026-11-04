import { p256 } from '@noble/curves/nist.js';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

/**
 * This device's P-256 keypair, used to authenticate with the Dynkle API
 * (src/devices/deviceAuth.js on the backend): the backend stores the public
 * key at pairing time, then challenges this device to sign a nonce with the
 * matching private key to mint a short-lived device token. The private key
 * never leaves this device.
 */

const PRIVATE_KEY = 'dynkle.device.privateKey';
const PUBLIC_KEY_SPKI = 'dynkle.device.publicKeySpki';

// X.509 SubjectPublicKeyInfo prefix for an uncompressed NIST P-256 key.
// The backend parses this with Node's `crypto.createPublicKey({ format: 'der', type: 'spki' })`.
const P256_SPKI_PREFIX = new Uint8Array([
  0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07,
  0x03, 0x42, 0x00,
]);

// Hermes doesn't reliably provide global btoa/atob, so base64 is hand-rolled here
// rather than depending on a runtime global.
const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += BASE64_CHARS[b0 >> 2];
    out += BASE64_CHARS[((b0 & 0x03) << 4) | (b1 === undefined ? 0 : b1 >> 4)];
    out += b1 === undefined ? '=' : BASE64_CHARS[((b1 & 0x0f) << 2) | (b2 === undefined ? 0 : b2 >> 6)];
    out += b2 === undefined ? '=' : BASE64_CHARS[b2 & 0x3f];
  }
  return out;
}

function fromBase64(b64: string): Uint8Array {
  const clean = b64.replace(/=+$/, '');
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let byteIndex = 0;
  let buffer = 0;
  let bits = 0;
  for (const char of clean) {
    const value = BASE64_CHARS.indexOf(char);
    if (value === -1) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[byteIndex++] = (buffer >> bits) & 0xff;
    }
  }
  return bytes.slice(0, byteIndex);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

async function loadOrCreateSecretKey(): Promise<Uint8Array> {
  const stored = await SecureStore.getItemAsync(PRIVATE_KEY);
  if (stored) return fromBase64(stored);
  // randomSecretKey needs >= 48 bytes of entropy to map onto the P-256 field without bias.
  const secretKey = p256.utils.randomSecretKey(Crypto.getRandomBytes(48));
  await SecureStore.setItemAsync(PRIVATE_KEY, toBase64(secretKey));
  await SecureStore.deleteItemAsync(PUBLIC_KEY_SPKI);
  return secretKey;
}

/** Base64 SPKI DER public key, generating a keypair on first call. */
export async function getDevicePublicKeySpki(): Promise<string> {
  const cached = await SecureStore.getItemAsync(PUBLIC_KEY_SPKI);
  if (cached) return cached;
  const secretKey = await loadOrCreateSecretKey();
  const point = p256.getPublicKey(secretKey, false);
  const spki = toBase64(concat(P256_SPKI_PREFIX, point));
  await SecureStore.setItemAsync(PUBLIC_KEY_SPKI, spki);
  return spki;
}

/**
 * Signs a server-issued nonce with this device's private key: SHA-256 over the
 * nonce's UTF-8 bytes, DER-encoded ECDSA signature, base64 — matching Node's
 * `crypto.verify('sha256', nonceBytes, publicKey, signature)` on the backend.
 */
export async function signNonce(nonce: string): Promise<string> {
  const secretKey = await loadOrCreateSecretKey();
  const message = new TextEncoder().encode(nonce);
  const sig = p256.sign(message, secretKey, { prehash: true });
  return toBase64(sig.toBytes('der'));
}

/** Wipes the local keypair (e.g. after an unpair) so the next pairing gets a fresh identity. */
export async function forgetDeviceKey(): Promise<void> {
  await SecureStore.deleteItemAsync(PRIVATE_KEY);
  await SecureStore.deleteItemAsync(PUBLIC_KEY_SPKI);
}
