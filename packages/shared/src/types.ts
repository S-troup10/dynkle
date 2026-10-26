export interface Merchant {
  id: string;
  name: string;
  legalName: string;
  abn: string;
  address: string;
  phone: string;
  email: string;
  walletAddress: string;
}

export interface Till {
  id: string;
  name: string;
}

export interface TerminalSettings {
  tipsEnabled: boolean;
  /** Percentages offered on the tip prompt. */
  tipPresets: number[];
  currency: 'AUD';
  soundEnabled: boolean;
  priceLockSeconds: number;
}

export interface TerminalProfile {
  merchant: Merchant;
  till: Till;
  settings: TerminalSettings;
  serial: string;
  appVersion: string;
  firmwareVersion: string;
}

export interface Category {
  id: string;
  name: string;
  /** Sub-categories ("groups") point at their parent. */
  parentId: string | null;
  sort: number;
}

export interface Variant {
  id: string;
  name: string;
  priceCents: number;
}

export interface Item {
  id: string;
  categoryId: string;
  name: string;
  /** Optional filter chip inside a category, e.g. "Milk coffee". */
  group?: string;
  variants: Variant[];
  sort: number;
}

export interface Catalog {
  categories: Category[];
  items: Item[];
  updatedAt: string;
}

export interface OrderLine {
  id: string;
  kind: 'item' | 'custom';
  itemId?: string;
  variantId?: string;
  name: string;
  detail: string;
  unitCents: number;
  qty: number;
}

export type PaymentStatus =
  | 'armed'
  | 'wallet_connected'
  | 'approved'
  | 'confirming'
  | 'paid'
  | 'failed'
  | 'expired'
  | 'cancelled';

export const FINAL_STATUSES: PaymentStatus[] = ['paid', 'failed', 'expired', 'cancelled'];

export type PaymentChannel = 'tap' | 'qr' | 'bluetooth';

export interface PaymentMethod {
  wallet: 'DYNK app' | 'Phantom' | 'Solflare' | 'Backpack';
  channel: PaymentChannel;
}

export interface PaymentSession {
  id: string;
  tillId: string;
  status: PaymentStatus;
  source: 'terminal' | 'dashboard';
  reference?: string;
  lines: OrderLine[];
  subtotalCents: number;
  tipCents: number;
  totalCents: number;
  gstCents: number;
  customerFeeCents: number;
  createdAt: string;
  expiresAt: string;
  /** Universal link that opens the DYNK app and wraps the Solana Pay request. */
  qrUrl: string;
  /** Same payload served over NFC (HCE NDEF URI record). */
  ndefUrl: string;
  /** Raw Solana Pay transaction-request URL. */
  solanaPayUrl: string;
  method?: PaymentMethod;
  customerWallet?: string;
  failureReason?: string;
  txSignature?: string;
  completedAt?: string;
}

export interface CreatePaymentRequest {
  lines: OrderLine[];
  subtotalCents: number;
  tipCents: number;
  reference?: string;
}

export interface RemoteCharge {
  id: string;
  amountCents: number;
  reference: string;
  sentBy: string;
  sentAt: string;
  lines: OrderLine[];
}

export interface PairingCode {
  code: string;
  expiresAt: string;
  status: 'waiting' | 'claimed' | 'expired';
  token?: string;
}

export interface TransactionsResponse {
  totalPaidCents: number;
  paidCount: number;
  failedCount: number;
  expiredCount: number;
  transactions: PaymentSession[];
}

export type ServerEvent =
  | { type: 'payment.status'; payment: PaymentSession }
  | { type: 'remote_charge'; charge: RemoteCharge }
  | { type: 'catalog.updated'; catalog: Catalog }
  | { type: 'settings.updated'; profile: TerminalProfile }
  | { type: 'terminal.unpaired' }
  | { type: 'software_update'; version: string };
