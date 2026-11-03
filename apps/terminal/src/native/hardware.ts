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

export type BleTxPower = 'ultraLow' | 'low' | 'medium' | 'high';
interface Subscription {
  remove(): void;
}
interface BleNativeModule {
  getState(): RadioState;
  start(sessionJson: string, txPower: BleTxPower): Promise<void>;
  setSession(sessionJson: string): void;
  stopAdvertising(): void;
  stop(): void;
  addListener(event: 'onRead', fn: (e: { device: string }) => void): Subscription;
  addListener(event: 'onMessage', fn: (e: { device: string; text: string }) => void): Subscription;
  addListener(event: 'onConnectionChange', fn: (e: { device: string; connected: boolean }) => void): Subscription;
  addListener(event: 'onError', fn: (e: { message: string }) => void): Subscription;
}

const nfcNative = requireOptionalNativeModule<NfcModule>('DynkleNfc');
const bleNative = requireOptionalNativeModule<BleNativeModule>('DynkleBle');
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

// ---------- Bluetooth LE peripheral (DYNK app Tap to Pay; the terminal is the receiver) ----------

export interface BleListener {
  onRead?: (device: string) => void;
  /** A UTF-8 JSON status message the phone wrote (already reassembled from prepared writes). */
  onMessage?: (device: string, text: string) => void;
  onConnectionChange?: (device: string, connected: boolean) => void;
  onError?: (message: string) => void;
}

const bleListeners = new Set<BleListener>();
const emitBle = <K extends keyof BleListener>(key: K, ...args: Parameters<NonNullable<BleListener[K]>>) => {
  for (const l of bleListeners) (l[key] as ((...a: unknown[]) => void) | undefined)?.(...args);
};
if (bleNative) {
  bleNative.addListener('onRead', (e) => emitBle('onRead', e.device));
  bleNative.addListener('onMessage', (e) => emitBle('onMessage', e.device, e.text));
  bleNative.addListener('onConnectionChange', (e) => emitBle('onConnectionChange', e.device, e.connected));
  bleNative.addListener('onError', (e) => emitBle('onError', e.message));
}

/** Simulated peripheral for the web preview: the dev panel's pretend DYNK phone drives it over the live connection. */
const simBle = { session: null as string | null, advertising: false, payingDevice: null as string | null };

async function ensureBlePermissions(): Promise<boolean> {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 31) return true;
  const wanted = ['android.permission.BLUETOOTH_ADVERTISE', 'android.permission.BLUETOOTH_CONNECT'] as Permission[];
  const result = await PermissionsAndroid.requestMultiple(wanted);
  return wanted.every((p) => result[p] === PermissionsAndroid.RESULTS.GRANTED);
}

export const ble = {
  simulated: !bleNative,
  state(): RadioState {
    return bleNative ? bleNative.getState() : 'ready';
  },
  /** Serve this session JSON and advertise the Tap to Pay service. */
  async start(sessionJson: string, txPower: BleTxPower) {
    if (bleNative) {
      if (!(await ensureBlePermissions())) throw new Error('Bluetooth permission was not granted');
      await bleNative.start(sessionJson, txPower);
      return;
    }
    Object.assign(simBle, { session: sessionJson, advertising: true, payingDevice: null });
  },
  setSession(sessionJson: string) {
    if (bleNative) bleNative.setSession(sessionJson);
    else simBle.session = sessionJson;
  },
  stopAdvertising() {
    if (bleNative) bleNative.stopAdvertising();
    else simBle.advertising = false;
  },
  stop() {
    if (bleNative) bleNative.stop();
    else Object.assign(simBle, { session: null, advertising: false, payingDevice: null });
  },
  addListener(listener: BleListener) {
    bleListeners.add(listener);
    return () => {
      bleListeners.delete(listener);
    };
  },
  /** Web/dev only: a pretend phone reads, writes or walks away (from the dev panel). Mirrors the native module's rules. */
  simulate(e: { action: 'read' | 'write' | 'disconnect'; device: string; text?: string }) {
    if (bleNative || !simBle.session) return;
    if (simBle.payingDevice && simBle.payingDevice !== e.device) return;
    if (e.action === 'read') {
      emitBle('onConnectionChange', e.device, true);
      emitBle('onRead', e.device);
    } else if (e.action === 'write' && e.text != null) {
      if (/"transferStatus"\s*:\s*"processing"/.test(e.text) && !simBle.payingDevice) {
        simBle.payingDevice = e.device;
        simBle.advertising = false;
      }
      emitBle('onMessage', e.device, e.text);
    } else if (e.action === 'disconnect') {
      emitBle('onConnectionChange', e.device, false);
    }
  },
};
