import { create } from 'zustand';
import type { TerminalProfile } from '@dynkle/shared';
import { defaultApiUrl } from '@/lib/config';
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
  profile: TerminalProfile | null;
  hydrate: () => Promise<void>;
  completePairing: (token: string, profile: TerminalProfile) => void;
  setProfile: (profile: TerminalProfile) => void;
  setApiUrl: (url: string | null) => void;
  markUnpaired: () => void;
  forget: () => void;
}

const K = { token: 'dynkle.token', profile: 'dynkle.profile', apiUrl: 'dynkle.apiUrl' };

export const useSession = create<SessionState>((set, get) => ({
  phase: 'booting',
  apiUrl: defaultApiUrl(),
  token: null,
  profile: null,

  hydrate: async () => {
    const [token, profile, apiUrl] = await Promise.all([
      storage.get<string>(K.token),
      storage.get<TerminalProfile>(K.profile),
      storage.get<string>(K.apiUrl),
    ]);
    set({
      token,
      profile,
      apiUrl: apiUrl ?? defaultApiUrl(),
      phase: token ? 'paired' : 'onboarding',
    });
  },

  completePairing: (token, profile) => {
    storage.set(K.token, token);
    storage.set(K.profile, profile);
    set({ token, profile, phase: 'paired' });
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
    set({ token: null, phase: 'unpaired' });
  },

  /** Unpaired from the terminal's own admin settings: go straight back to pairing. */
  forget: () => {
    storage.set(K.token, null);
    storage.set(K.profile, null);
    set({ token: null, profile: null, phase: 'onboarding' });
  },
}));
