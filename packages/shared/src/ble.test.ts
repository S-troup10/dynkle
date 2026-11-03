import { describe, expect, it } from 'vitest';
import { parseBleSenderMessage, serializeBleSession, utf8ByteLength } from './ble';
import { formatTokenAmount, parseTokenAmount } from './money';

describe('DYNK token amounts', () => {
  it('formats raw units', () => {
    expect(formatTokenAmount('1043710000', 6)).toBe('1043.71');
    expect(formatTokenAmount('1043710001', 6)).toBe('1043.710001');
    expect(formatTokenAmount(5n, 6)).toBe('0.000005');
    expect(formatTokenAmount('7000000', 6)).toBe('7');
  });

  it('parses typed amounts', () => {
    expect(parseTokenAmount('432.18', 6)).toBe(432180000n);
    expect(parseTokenAmount('10', 9)).toBe(10_000_000_000n);
    expect(parseTokenAmount('1.2345678', 6)).toBe(1234567n);
    expect(parseTokenAmount('-1', 6)).toBeNull();
    expect(parseTokenAmount('1e3', 6)).toBeNull();
  });
});

describe('Bluetooth session wire format', () => {
  it('is compact JSON in the app’s field order, and a SOL-only session is small', () => {
    const wire = serializeBleSession({
      v: 2,
      n: '3f1c2a8e-5b7d-4e0a-9c6f-2d8b1a4e7c90',
      e: 1762070400000,
      d: 'Blackall St Cafe',
      a: { SOL: '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin' },
      s: 'x'.repeat(88),
    });
    expect(wire.startsWith('{"v":2,"n":"3f1c')).toBe(true);
    expect(wire).toBe(JSON.stringify(JSON.parse(wire)));
    expect(utf8ByteLength(wire)).toBeLessThan(260);
  });

  it('leaves out the signature when there is none', () => {
    expect(serializeBleSession({ v: 2, n: 'n', e: 1, d: 'd', a: { SOL: 'a' } })).toBe('{"v":2,"n":"n","e":1,"d":"d","a":{"SOL":"a"}}');
  });
});

describe('messages from the phone', () => {
  it('reads the app’s status writes', () => {
    const msg = parseBleSenderMessage(
      JSON.stringify({ transferStatus: 'confirmed', txSignature: '5h3k', amount: '432.18', symbol: 'DYNK', fiatAmountUsd: 6.52, extra: 1 }),
    );
    expect(msg).toMatchObject({ transferStatus: 'confirmed', txSignature: '5h3k', fiatAmountUsd: 6.52 });
  });

  it('returns null for anything else', () => {
    expect(parseBleSenderMessage('{"transferStatus":"done"}')).toBeNull();
    expect(parseBleSenderMessage('not json')).toBeNull();
  });
});
