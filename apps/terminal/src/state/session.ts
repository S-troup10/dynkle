import { create } from 'zustand';
import type { TerminalProfile } from '@dynkle/shared';
import { defaultApiUrl } from '@/lib/config';
import { forgetDeviceKey } from '@/lib/deviceKey';
import { storage } from '@/lib/storage';

/**
 * booting    -> reading storage
 * onboarding -> never paired (or unpaired from the terminal itself)
 * paired     -> has a device token
 * unpaired   -> the dashboard removed this terminal; shows "This terminal was unpaired"
 */
export type Phase = 'booting' | 'onboarding' | 'paired' | 'unpaired';

interface SessionState {
  phase: Phase;
  apiUrl: string;
  token: string | null;
  /** This device's id on the backend, needed to re-authenticate (challenge + signature) when the token expires. */
  deviceId: string | null;
  profile: TerminalProfile | null;
  hydrate: () => Promise<void>;
  completePairing: (token: string, profile: TerminalProfile, deviceId: string) => void;
  setToken: (token: string) => void;
  setProfile: (profile: TerminalProfile) => void;
  setApiUrl: (url: string | null) => void;
  markUnpaired: () => void;
  forget: () => void;
}

const K = { token: 'dynkle.token', profile: 'dynkle.profile', apiUrl: 'dynkle.apiUrl', deviceId: 'dynkle.deviceId' };

export const useSession = create<SessionState>((set, get) => ({
  phase: 'booting',
  apiUrl: defaultApiUrl(),
  token: null,
  deviceId: null,
  profile: null,

  hydrate: async () => {
    const [token, profile, apiUrl, deviceId] = await Promise.all([
      storage.get<string>(K.token),
      storage.get<TerminalProfile>(K.profile),
      storage.get<string>(K.apiUrl),
      storage.get<string>(K.deviceId),
    ]);
    set({
      token,
      profile,
      deviceId,
      apiUrl: apiUrl ?? defaultApiUrl(),
      phase: token ? 'paired' : 'onboarding',
    });
  },

  completePairing: (token, profile, deviceId) => {
    storage.set(K.token, token);
    storage.set(K.profile, profile);
    storage.set(K.deviceId, deviceId);
    set({ token, profile, deviceId, phase: 'paired' });
  },

  /** Swaps in a freshly-minted device token after a challenge/signature refresh. */
  setToken: (token) => {
    storage.set(K.token, token);
    set({ token });
  },

  setProfile: (profile) => {
    storage.set(K.profile, profile);
    set({ profile });
  },

  setApiUrl: (url) => {
    storage.set(K.apiUrl, url);
    set({ apiUrl: url ?? defaultApiUrl() });
  },

  markUnpaired: () => {
    if (get().phase !== 'paired') return;
    storage.set(K.token, null);
    storage.set(K.deviceId, null);
    set({ token: null, deviceId: null, phase: 'unpaired' });
    void forgetDeviceKey();
  },

  /** Unpaired from the terminal's own admin settings: go straight back to pairing. */
  forget: () => {
    storage.set(K.token, null);
    storage.set(K.profile, null);
    storage.set(K.deviceId, null);
    set({ token: null, profile: null, deviceId: null, phase: 'onboarding' });
    void forgetDeviceKey();
  },
}));
