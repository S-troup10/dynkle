import { describe, expect, it } from 'vitest';
import { formatFee, formatMoney, gstIncluded, keypadPress, percentOf } from './money';

describe('money', () => {
  it('formats cents', () => {
    expect(formatMoney(2415)).toBe('$24.15');
    expect(formatMoney(0)).toBe('$0.00');
    expect(formatMoney(48250)).toBe('$482.50');
    expect(formatMoney(123456789)).toBe('$1,234,567.89');
  });
  it('formats the customer fee', () => {
    expect(formatFee(1)).toBe('1¢');
  });
  it('computes included GST', () => {
    expect(gstIncluded(2100)).toBe(191);
  });
  it('computes tips', () => {
    expect(percentOf(2100, 15)).toBe(315);
    expect(percentOf(2100, 10)).toBe(210);
  });
  it('handles keypad entry', () => {
    let c = 0;
    for (const k of ['1', '2', '5', '0']) c = keypadPress(c, k);
    expect(c).toBe(1250);
    expect(keypadPress(c, 'del')).toBe(125);
    expect(keypadPress(12, '00')).toBe(1200);
    expect(keypadPress(9_999_999, '1')).toBe(9_999_999);
    expect(keypadPress(5, 'x')).toBe(5);
  });
});
