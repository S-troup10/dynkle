import { Linking, PermissionsAndroid, Platform, type Permission } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

/**
 * Thin wrappers over Dynkle's local Expo modules (apps/terminal/modules/*).
 * When a module isn't compiled in (web preview, Expo Go) we fall back to a
 * simulated implementation so the UI can still be exercised end to end.
 */

export type RadioState = 'ready' | 'off' | 'unsupported';

interface NfcModule {
  getState(): RadioState;
  setPayload(uri: string | null): void;
}
interface KioskModule {
  isDeviceOwner(): boolean;
  isLocked(): boolean;
  start(): void;
  stop(): void;
  restart(): void;
}
export interface WifiNetwork {
  ssid: string;
  secured: boolean;
  level: number; // 0..3
  connected?: boolean;
}
interface WifiModule {
  scan(): Promise<WifiNetwork[]>;
  connect(ssid: string, password: string | null): Promise<boolean>;
  currentSsid(): string | null;
  openPanel(): void;
  forgetAll(): Promise<void>;
  bluetoothState(): RadioState;
}

const nfcNative = requireOptionalNativeModule<NfcModule>('DynkleNfc');
const kioskNative = requireOptionalNativeModule<KioskModule>('DynkleKiosk');
const wifiNative = requireOptionalNativeModule<WifiModule>('DynkleWifi');

export const simulatedHardware = !nfcNative;

let simulatedNfc: RadioState = 'ready';

export const nfc = {
  state(): RadioState {
    if (nfcNative) return nfcNative.getState();
    return simulatedNfc;
  },
  /** Serve this URI to phones that tap the terminal (HCE NDEF tag). null stops serving. */
  arm(uri: string | null) {
    nfcNative?.setPayload(uri);
  },
  /** Web/dev only: flip the simulated reader to preview the "Tap unavailable" state. */
  simulate(state: RadioState) {
    simulatedNfc = state;
  },
};

export const kiosk = {
  available: !!kioskNative,
  isDeviceOwner: () => kioskNative?.isDeviceOwner() ?? false,
  isLocked: () => kioskNative?.isLocked() ?? false,
  start: () => kioskNative?.start(),
  stop: () => kioskNative?.stop(),
  restart: () => {
    if (kioskNative) kioskNative.restart();
    else if (Platform.OS === 'web' && typeof window !== 'undefined') window.location.reload();
  },
};

const SIMULATED_NETWORKS: WifiNetwork[] = [
  { ssid: 'Shop WiFi', secured: true, level: 3, connected: true },
  { ssid: 'Shop Guest', secured: true, level: 2 },
  { ssid: 'Office-5G', secured: true, level: 1 },
];

/** WiFi scan results need location (≤ Android 12) or nearby-devices (13+) permission. */
async function ensureScanPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const wanted = (
    Number(Platform.Version) >= 33 ? ['android.permission.NEARBY_WIFI_DEVICES'] : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION]
  ) as Permission[];
  const result = await PermissionsAndroid.requestMultiple(wanted);
  return wanted.every((p) => result[p] === PermissionsAndroid.RESULTS.GRANTED);
}

export const wifi = {
  native: !!wifiNative,
  scan: async (): Promise<WifiNetwork[]> => {
    if (!wifiNative) return SIMULATED_NETWORKS;
    if (!(await ensureScanPermission())) return [];
    return wifiNative.scan();
  },
  connect: async (ssid: string, password: string | null) => (wifiNative ? wifiNative.connect(ssid, password) : true),
  currentSsid: () => (wifiNative ? wifiNative.currentSsid() : 'Shop WiFi'),
  openPanel: () => {
    if (wifiNative) wifiNative.openPanel();
    else if (Platform.OS === 'android') Linking.sendIntent('android.settings.WIFI_SETTINGS').catch(() => undefined);
  },
  forgetAll: async () => wifiNative?.forgetAll(),
};

export const bluetooth = {
  state: (): RadioState => (wifiNative ? wifiNative.bluetoothState() : 'ready'),
};
