import { create } from 'zustand';
import type { Item, OrderLine, Variant } from '@dynkle/shared';
import { addCustomLine, addItemLine, changeQty, removeLine } from './cartLogic';

interface CartState {
  lines: OrderLine[];
  /** What's typed on the keypad tab right now. */
  keypadCents: number;
  setKeypad: (cents: number) => void;
  addItem: (item: Item, variant: Variant, qty: number, detail?: string) => void;
  addCustom: (cents: number) => void;
  changeQty: (id: string, delta: number) => void;
  remove: (id: string) => void;
  clear: () => void;
}

export const useCart = create<CartState>((set) => ({
  lines: [],
  keypadCents: 0,
  setKeypad: (keypadCents) => set({ keypadCents }),
  addItem: (item, variant, qty, detail) => set((s) => ({ lines: addItemLine(s.lines, item, variant, qty, detail) })),
  addCustom: (cents) => set((s) => ({ lines: addCustomLine(s.lines, cents) })),
  changeQty: (id, delta) => set((s) => ({ lines: changeQty(s.lines, id, delta) })),
  remove: (id) => set((s) => ({ lines: removeLine(s.lines, id) })),
  clear: () => set({ lines: [], keypadCents: 0 }),
}));
