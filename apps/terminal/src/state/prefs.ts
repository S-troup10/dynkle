import { create } from 'zustand';
import { storage } from '@/lib/storage';
import { useSession } from './session';

/** Settings that belong to this terminal (not the dashboard), saved on the device. */
interface PrefsState {
  /** null = follow the dashboard's default. */
  sound: boolean | null;
  hydrate: () => Promise<void>;
  setSound: (on: boolean) => void;
  /** Factory reset: back to the dashboard's defaults. */
  reset: () => void;
}

const K = { sound: 'dynkle.prefs.sound' };

export const usePrefs = create<PrefsState>((set) => ({
  sound: null,
  hydrate: async () => {
    set({ sound: await storage.get<boolean>(K.sound) });
  },
  setSound: (sound) => {
    storage.set(K.sound, sound);
    set({ sound });
  },
  reset: () => {
    storage.set(K.sound, null);
    set({ sound: null });
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
