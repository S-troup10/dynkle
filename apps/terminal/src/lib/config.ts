import { Platform } from 'react-native';

/** Where the merchant dashboard (the mock server in V1) lives. */
export function defaultApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  if (Platform.OS === 'web' && typeof window !== 'undefined') return `http://${window.location.hostname}:4000`;
  // Android emulator's alias for the host machine.
  return 'http://10.0.2.2:4000';
}

export const APP_VERSION = '1.0.0';
