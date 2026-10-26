import type { PaymentMethod, PaymentSession } from '@dynkle/shared';

export function formatTime(iso: string): string {
  const d = new Date(iso);
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return `${h}:${m}${ampm}`;
}

export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

const CHANNEL: Record<PaymentMethod['channel'], string> = { tap: 'Tap', qr: 'QR', bluetooth: 'Bluetooth' };

export function methodLabel(m?: PaymentMethod): string {
  return m ? `${m.wallet} · ${CHANNEL[m.channel]}` : 'No payment';
}

/** "Latte ×2 + 2 more", "Mocha, Croissant", "Table 4". */
export function paymentTitle(p: PaymentSession): string {
  if (p.source === 'dashboard' && p.reference) return p.reference;
  if (p.lines.length === 0) return p.reference ?? 'Custom amount';
  const first = p.lines[0];
  const firstLabel = first.qty > 1 ? `${first.name} ×${first.qty}` : first.name;
  if (p.lines.length === 1) return firstLabel;
  if (p.lines.length === 2 && p.lines.every((l) => l.qty === 1)) return p.lines.map((l) => l.name).join(', ');
  return `${firstLabel} + ${p.lines.length - 1} more`;
}

export function paymentSubtitle(p: PaymentSession): string {
  if (p.status === 'expired' && !p.method) return 'No payment';
  if (p.source === 'dashboard' && !p.method) return 'Sent from dashboard';
  if (p.source === 'dashboard') return 'Sent from dashboard';
  return methodLabel(p.method);
}

export function isToday(iso: string): boolean {
  const d = new Date(iso);
  const n = new Date();
  return d.toDateString() === n.toDateString();
}
