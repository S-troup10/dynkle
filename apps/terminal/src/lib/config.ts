import Constants from 'expo-constants';
import { Platform } from 'react-native';

/** The Dynkle POS backend (Express + Prisma + Postgres) deployed on Render. */
export const HOSTED_DASHBOARD_URL = 'https://dynkle-api.onrender.com';

/** Where the Dynkle API lives. */
export function defaultApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  // Local web preview talks to a locally-run backend (see dynkle-api-main/README.md).
  if (Platform.OS === 'web' && typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)) {
    return `http://${window.location.hostname}:4100`;
  }
  return HOSTED_DASHBOARD_URL;
}

/** The app's version, from app.json ("expo.version"). */
export const APP_VERSION: string = Constants.expoConfig?.version ?? '0.0.0';
