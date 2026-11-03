export const CURRENCY = 'AUD' as const;

/** Format integer cents as a dollar string, e.g. 2415 -> "$24.15". */
export function formatMoney(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const dollars = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const rest = (abs % 100).toString().padStart(2, '0');
  return `${negative ? '-' : ''}$${dollars}.${rest}`;
}

/** Customer-facing fee, shown as "1¢". */
export function formatFee(cents: number): string {
  return cents < 100 ? `${cents}¢` : formatMoney(cents);
}

/** GST included in a GST-inclusive Australian price (1/11th). */
export function gstIncluded(totalCents: number): number {
  return Math.round(totalCents / 11);
}

export function percentOf(cents: number, percent: number): number {
  return Math.round((cents * percent) / 100);
}

export const MAX_KEYPAD_CENTS = 9_999_999;

/** Keypad entry: digits shift in from the right, "00" multiplies by 100, "del" shifts out. */
export function keypadPress(cents: number, key: string): number {
  let next: number;
  if (key === 'del') next = Math.floor(cents / 10);
  else if (key === '00') next = cents * 100;
  else if (/^\d$/.test(key)) next = cents * 10 + Number(key);
  else return cents;
  return next > MAX_KEYPAD_CENTS ? cents : next;
}

/** Integer token units -> decimal string without trailing zeros, e.g. ("432180000", 6) -> "432.18". */
export function formatTokenAmount(raw: string | bigint, decimals: number): string {
  const v = BigInt(raw);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = (abs % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${neg ? '-' : ''}${whole}${frac ? `.${frac}` : ''}`;
}

/** Decimal string -> integer token units. Returns null for anything that isn't a plain non-negative decimal. */
export function parseTokenAmount(text: string, decimals: number): bigint | null {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(text.trim());
  if (!m) return null;
  const frac = (m[2] ?? '').slice(0, decimals).padEnd(decimals, '0');
  return BigInt(m[1]) * 10n ** BigInt(decimals) + BigInt(frac || '0');
}
