export interface Merchant {
  id: string;
  name: string;
  legalName: string;
  abn: string;
  address: string;
  phone: string;
  email: string;
  walletAddress: string;
  /** IANA time zone the merchant trades in. "Today" on the terminal starts at midnight here. */
  timezone: string;
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
  /** DYNK per A$1, used to quote Bluetooth Tap to Pay charges. */
  dynkPerAud: number;
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

export type PaymentStatus = 'armed' | 'wallet_connected' | 'approved' | 'confirming' | 'paid' | 'failed' | 'expired' | 'cancelled';

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
  /** What the merchant receives: subtotal + tip. */
  totalCents: number;
  gstCents: number;
  /**
   * Network fee the customer pays on top of `totalCents`, in their wallet.
   * It is not part of the sale total and the merchant never receives it.
   */
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
  /** What the customer must send in DYNK for this charge (Bluetooth Tap to Pay). */
  dynk?: DynkQuote;
  /** On-chain check of the payment. The terminal never decides "Paid" by itself. */
  verification?: PaymentVerification;
  /** Machine-readable reason for `failed`. */
  failureCode?: 'declined' | 'wrong_amount' | 'not_found' | 'transfer_failed' | 'wallet_failed';
}

export interface DynkQuote {
  symbol: 'DYNK';
  mint: string;
  decimals: number;
  /** Token units as a decimal string, e.g. "432.18". This is what the customer types today. */
  amount: string;
  /** amount × 10^decimals as an integer string. Unique among open charges to the same wallet. */
  amountRaw: string;
  /** Merchant receiving wallet (owner of the token account). */
  recipient: string;
  /** Price used: DYNK per A$1. */
  rate: number;
}

export interface PaymentVerification {
  txSignature: string;
  result: 'paid' | 'wrong_amount' | 'failed' | 'not_found';
  /** Raw token units received. */
  receivedRaw?: string;
  /** When paid more than asked: the excess (flag for a refund). */
  excessRaw?: string;
  /** When paid less than asked. */
  shortfallRaw?: string;
  /** How it was found: the phone's Bluetooth write, or the chain watcher. */
  via: 'bluetooth' | 'watcher';
  checkedAt: string;
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
  | { type: 'software_update'; version: string }
  /** Sent every few seconds so the terminal can tell a quiet connection from a dead one. */
  | { type: 'heartbeat'; at: string }
  /** Dev panel only: drives the simulated Bluetooth peripheral in the web preview (a pretend DYNK phone). */
  | { type: 'dev.ble'; action: 'read'; device: string }
  | { type: 'dev.ble'; action: 'write'; device: string; text: string }
  | { type: 'dev.ble'; action: 'disconnect'; device: string };
