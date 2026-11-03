import bs58 from 'bs58';
import nacl from 'tweetnacl';

/**
 * The merchant's receiving wallet. Sessions are signed with its key so the DYNK
 * app shows the merchant as "verified" and pays straight away (spec §2.3 option i).
 * With only an address (no secret), sessions go out unsigned and the customer
 * sees a "confirm who you're paying" screen (option iii).
 */
export interface MerchantWallet {
  address: string;
  /** ed25519 detached signature, or undefined when we don't hold the key. */
  sign?: (message: Uint8Array) => Uint8Array;
}

export function walletFromSecret(secretBs58: string): MerchantWallet {
  const secret = bs58.decode(secretBs58.trim());
  const pair =
    secret.length === 64
      ? nacl.sign.keyPair.fromSecretKey(secret)
      : secret.length === 32
        ? nacl.sign.keyPair.fromSeed(secret)
        : (() => {
            throw new Error('MERCHANT_SOL_SECRET must be a bs58 64-byte secret key (Solana keypair) or 32-byte seed');
          })();
  return { address: bs58.encode(pair.publicKey), sign: (m) => nacl.sign.detached(m, pair.secretKey) };
}

export function generateWallet(): MerchantWallet & { secret: string } {
  const pair = nacl.sign.keyPair();
  return { address: bs58.encode(pair.publicKey), secret: bs58.encode(pair.secretKey), sign: (m) => nacl.sign.detached(m, pair.secretKey) };
}

export function addressOnlyWallet(address: string): MerchantWallet {
  const key = bs58.decode(address.trim());
  if (key.length !== 32) throw new Error('MERCHANT_SOL_ADDRESS is not a Solana address');
  return { address: address.trim() };
}

/** What the DYNK app does (bleSignatureVerify.ts): ed25519 over the raw UTF-8 bytes of the nonce. */
export function verifyNonceSignature(nonce: string, signatureBs58: string, addressBs58: string): boolean {
  try {
    return nacl.sign.detached.verify(new TextEncoder().encode(nonce), bs58.decode(signatureBs58), bs58.decode(addressBs58));
  } catch {
    return false;
  }
}
