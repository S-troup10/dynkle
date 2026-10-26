import { create } from 'zustand';

interface UiState {
  socket: 'connecting' | 'open' | 'closed';
  netConnected: boolean;
  netType: string | null;
  wifiName: string | null;
  updateVersion: string | null;
  adminUnlockedUntil: number;
  setSocket: (s: UiState['socket']) => void;
  setNet: (connected: boolean, type: string | null, wifiName: string | null) => void;
  setUpdate: (version: string | null) => void;
  unlockAdmin: (ms: number) => void;
  lockAdmin: () => void;
}

export const useUi = create<UiState>((set) => ({
  socket: 'closed',
  netConnected: true,
  netType: null,
  wifiName: null,
  updateVersion: null,
  adminUnlockedUntil: 0,
  setSocket: (socket) => set({ socket }),
  setNet: (netConnected, netType, wifiName) => set({ netConnected, netType, wifiName }),
  setUpdate: (updateVersion) => set({ updateVersion }),
  unlockAdmin: (ms) => set({ adminUnlockedUntil: Date.now() + ms }),
  lockAdmin: () => set({ adminUnlockedUntil: 0 }),
}));

/** Offline means no network, or the dashboard can't be reached. */
export function useOffline(): { offline: boolean; reason: 'network' | 'server' | null } {
  const net = useUi((s) => s.netConnected);
  const socket = useUi((s) => s.socket);
  if (!net) return { offline: true, reason: 'network' };
  if (socket === 'closed') return { offline: true, reason: 'server' };
  return { offline: false, reason: null };
}
