import { Platform } from 'react-native';

/** The mock merchant dashboard deployed on Render (see render.yaml). */
export const HOSTED_DASHBOARD_URL = 'https://dynkle-mock.onrender.com';

/** Where the merchant dashboard (the mock server in V1) lives. */
export function defaultApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  // Local web preview talks to the local mock server (npm run server).
  if (Platform.OS === 'web' && typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)) {
    return `http://${window.location.hostname}:4000`;
  }
  return HOSTED_DASHBOARD_URL;
}

export const APP_VERSION = '1.0.0';
