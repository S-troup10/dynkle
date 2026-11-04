import { signNonce } from '@/lib/deviceKey';
import { log } from '@/lib/logger';
import { useSession } from '@/state/session';

/**
 * Device tokens from the Dynkle API expire after 15 minutes
 * (src/devices/deviceAuth.js: DEVICE_TOKEN_TTL_SECONDS). There's no refresh
 * token for this flow — re-authenticating means signing a fresh server nonce
 * with this device's private key, so a stolen token alone can't renew itself.
 */

let refreshing: Promise<string> | null = null;

async function challengeAndSign(deviceId: string, apiUrl: string): Promise<string> {
  const challengeRes = await fetch(`${apiUrl}/api/terminals/auth/challenge`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ deviceId }),
  });
  const challenge = await challengeRes.json().catch(() => ({}));
  if (!challengeRes.ok) throw new Error(challenge.message || 'Could not start a new session for this device.');

  const signature = await signNonce(challenge.nonce);
  const tokenRes = await fetch(`${apiUrl}/api/terminals/auth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ deviceId, nonce: challenge.nonce, signature }),
  });
  const body = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok) throw new Error(body.message || 'This device could not re-authenticate.');
  return body.token as string;
}

/** Mints a fresh device token. Concurrent callers share one in-flight refresh. */
export async function refreshDeviceToken(): Promise<string> {
  if (refreshing) return refreshing;
  const { deviceId, apiUrl } = useSession.getState();
  if (!deviceId) throw new Error('Not paired.');
  refreshing = challengeAndSign(deviceId, apiUrl)
    .then((token) => {
      useSession.getState().setToken(token);
      return token;
    })
    .catch((e) => {
      log.warn('Could not refresh the device token', { error: e });
      throw e;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}
