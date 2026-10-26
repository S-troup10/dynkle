/// <reference types="jest" />
import type { Item, PaymentSession } from '@dynkle/shared';
import { addCustomLine, addItemLine, cartCount, cartTotal, changeQty, qtyOfItem, removeLine } from '@/state/cartLogic';
import { checkoutView, confirmationSteps, shouldApply } from '@/state/checkoutLogic';
import { formatCountdown, formatTime, paymentTitle } from '@/lib/format';

const latte: Item = {
  id: 'latte',
  categoryId: 'coffee',
  name: 'Latte',
  sort: 1,
  variants: [
    { id: 's', name: 'Small', priceCents: 480 },
    { id: 'm', name: 'Medium', priceCents: 550 },
  ],
};

describe('cart', () => {
  it('merges repeat items and totals the order', () => {
    let lines = addItemLine([], latte, latte.variants[1], 1);
    lines = addItemLine(lines, latte, latte.variants[1], 1);
    lines = addCustomLine(lines, 450);
    expect(lines).toHaveLength(2);
    expect(lines[0].qty).toBe(2);
    expect(lines[0].detail).toBe('Medium');
    expect(cartTotal(lines)).toBe(1550);
    expect(cartCount(lines)).toBe(3);
    expect(qtyOfItem(lines, 'latte')).toBe(2);
  });

  it('drops a line when its quantity hits zero', () => {
    let lines = addItemLine([], latte, latte.variants[0], 1);
    lines = changeQty(lines, lines[0].id, -1);
    expect(lines).toHaveLength(0);
  });

  it('ignores empty custom amounts and removes lines', () => {
    expect(addCustomLine([], 0)).toHaveLength(0);
    const lines = addCustomLine([], 100);
    expect(removeLine(lines, lines[0].id)).toHaveLength(0);
  });
});

describe('checkout', () => {
  it('maps payment status to the screen shown', () => {
    expect(checkoutView('armed')).toBe('armed');
    expect(checkoutView('wallet_connected')).toBe('confirming');
    expect(checkoutView('approved')).toBe('processing');
    expect(checkoutView('confirming')).toBe('processing');
    expect(checkoutView('paid')).toBe('paid');
    expect(checkoutView('expired')).toBe('expired');
  });

  it('builds the confirmation checklist', () => {
    expect(confirmationSteps('wallet_connected').map((s) => s.state)).toEqual(['done', 'active', 'todo']);
    expect(confirmationSteps('confirming').map((s) => s.state)).toEqual(['done', 'done', 'active']);
  });

  it('ignores stale or foreign status updates', () => {
    const p = { id: 'a', status: 'confirming' } as PaymentSession;
    expect(shouldApply(p, { ...p, status: 'wallet_connected' })).toBe(false);
    expect(shouldApply(p, { ...p, status: 'paid' })).toBe(true);
    expect(shouldApply(p, { ...p, id: 'b', status: 'paid' })).toBe(false);
    expect(shouldApply(null, p)).toBe(false);
  });
});

describe('format', () => {
  it('formats times and countdowns like the design', () => {
    const d = new Date();
    d.setHours(13, 14, 0, 0);
    expect(formatTime(d.toISOString())).toBe('1:14pm');
    d.setHours(0, 5);
    expect(formatTime(d.toISOString())).toBe('12:05am');
    expect(formatCountdown(83)).toBe('1:23');
    expect(formatCountdown(0)).toBe('0:00');
  });

  it('titles activity rows', () => {
    const base = { source: 'terminal', lines: [] } as unknown as PaymentSession;
    const line = (name: string, qty = 1) => ({ id: name, kind: 'item' as const, name, detail: '', unitCents: 100, qty });
    expect(paymentTitle({ ...base, lines: [line('Latte', 2), line('A'), line('B')] })).toBe('Latte ×2 + 2 more');
    expect(paymentTitle({ ...base, lines: [line('Mocha'), line('Croissant')] })).toBe('Mocha, Croissant');
    expect(paymentTitle({ ...base, source: 'dashboard', reference: 'Table 4' })).toBe('Table 4');
  });
});
