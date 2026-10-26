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
