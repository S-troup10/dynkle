import type { PaymentSession, TerminalProfile } from '@dynkle/shared';

export const profile: TerminalProfile = {
  merchant: {
    id: 'mer_1',
    name: 'Dynkle Café',
    legalName: 'Dynkle Café Pty Ltd',
    abn: '51 824 753 556',
    address: '12 Chapel St',
    phone: '(03) 9510 0000',
    email: 'hello@example.com',
    walletAddress: '9wQd…Ld2c',
    timezone: 'Australia/Melbourne',
  },
  till: { id: 'till_1', name: 'Till 1' },
  settings: { tipsEnabled: true, tipPresets: [10, 15, 20], currency: 'AUD', soundEnabled: true, priceLockSeconds: 90 },
  serial: 'DK1-000001',
  appVersion: '1.0.0',
  firmwareVersion: 'A14',
};

export function payment(patch: Partial<PaymentSession> = {}): PaymentSession {
  return {
    id: 'pay_1',
    tillId: 'till_1',
    status: 'armed',
    source: 'terminal',
    lines: [],
    subtotalCents: 2100,
    tipCents: 315,
    totalCents: 2415,
    gstCents: 191,
    customerFeeCents: 1,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 90_000).toISOString(),
    qrUrl: 'https://pay.dynk.io/p/pay_1',
    ndefUrl: 'https://pay.dynk.io/p/pay_1',
    solanaPayUrl: 'solana:https%3A%2F%2Fx',
    ...patch,
  };
}
