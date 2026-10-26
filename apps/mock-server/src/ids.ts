import { randomBytes } from 'node:crypto';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function pairingCode(length = 6): string {
  const bytes = randomBytes(length);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

export function id(prefix: string): string {
  return `${prefix}_${randomBytes(6).toString('hex')}`;
}

export function token(): string {
  return randomBytes(24).toString('base64url');
}

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function fakeBase58(length: number): string {
  return Array.from(randomBytes(length), (b) => B58[b % B58.length]).join('');
}
