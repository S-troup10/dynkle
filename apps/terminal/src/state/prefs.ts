import { create } from 'zustand';
import { storage } from '@/lib/storage';
import type { BleTxPower } from '@/native/hardware';
import { useSession } from './session';

/** Settings that belong to this terminal (not the dashboard), saved on the device. */
interface PrefsState {
  /** null = follow the dashboard's default. */
  sound: boolean | null;
  /** Bluetooth transmit power for Tap to Pay: lower = the phone must be closer. Tune on the real terminal. */
  bleTxPower: BleTxPower;
  setBleTxPower: (p: BleTxPower) => void;
  hydrate: () => Promise<void>;
  setSound: (on: boolean) => void;
  /** Factory reset: back to the dashboard's defaults. */
  reset: () => void;
}

const K = { sound: 'dynkle.prefs.sound', bleTxPower: 'dynkle.prefs.bleTxPower' };

export const usePrefs = create<PrefsState>((set) => ({
  sound: null,
  bleTxPower: 'high',
  hydrate: async () => {
    const [sound, bleTxPower] = await Promise.all([storage.get<boolean>(K.sound), storage.get<BleTxPower>(K.bleTxPower)]);
    set({ sound, bleTxPower: bleTxPower ?? 'high' });
  },
  setBleTxPower: (bleTxPower) => {
    storage.set(K.bleTxPower, bleTxPower);
    set({ bleTxPower });
  },
  setSound: (sound) => {
    storage.set(K.sound, sound);
    set({ sound });
  },
  reset: () => {
    storage.set(K.sound, null);
    storage.set(K.bleTxPower, null);
    set({ sound: null, bleTxPower: 'high' });
  },
}));

/** Sound is on unless this terminal turned it off, falling back to the dashboard setting. */
export function soundEnabled(): boolean {
  return usePrefs.getState().sound ?? useSession.getState().profile?.settings.soundEnabled ?? true;
}

export function useSoundEnabled(): boolean {
  const local = usePrefs((s) => s.sound);
  const fromDashboard = useSession((s) => s.profile?.settings.soundEnabled);
  return local ?? fromDashboard ?? true;
}
