import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  FINAL_STATUSES,
  gstIncluded,
  startOfDayIn,
  todayAt,
  type AddItemRequest,
  type Catalog,
  type Category,
  type CreatePaymentRequest,
  type Item,
  type OrderLine,
  type PairingCode,
  type PaymentMethod,
  type PaymentSession,
  type RemoteCharge,
  type ServerEvent,
  type TerminalProfile,
  type TerminalSettings,
  type Till,
  type TransactionsResponse,
  type RemoteChargeRequest,
  type UpdateItemRequest,
  type Variant,
  type VariantInput,
} from '@dynkle/shared';
import { fakeBase58, id, pairingCode, token } from './ids';
import { ADMIN_CODE, FIRMWARE_VERSION, defaultSettings, merchant, seedCatalog } from './seed';

export interface StoreOptions {
  pairingTtlMs?: number;
  /** Delay between "approved" -> "confirming" -> "paid" when simulating chain confirmation. */
  confirmDelayMs?: number;
  /** Add sample history to each newly paired till so the Activity tab isn't empty. */
  seedActivity?: boolean;
  /**
   * Secret used to sign device tokens. With it, a terminal's token stays valid
   * across server restarts even when nothing is saved to disk (Render's free plan
   * restarts the server and wipes memory whenever it sleeps).
   */
  tokenSecret?: string;
  /** JSON file the store is saved to and loaded from. Without it everything lives in memory. */
  dataFile?: string;
}

/** Adds a DYNK quote to a new charge (set by the DYNK Bluetooth payment service). */
export type Quoter = (totalCents: number, tillId: string) => PaymentSession['dynk'];

interface Device {
  token: string;
  till: Till;
  /** Version the terminal reported in its last request. */
  appVersion?: string;
}

type StoredRemoteCharge = RemoteCharge & { tillId: string; state: 'pending' | 'accepted' | 'dismissed'; paymentId?: string };

interface Snapshot {
  version: 1;
  savedAt: string;
  catalog: Catalog;
  settings: TerminalSettings;
  tillCount: number;
  devices: Device[];
  revokedTills: string[];
  payments: PaymentSession[];
  remoteCharges: StoredRemoteCharge[];
  idempotency: Array<[string, string]>;
}

const LIVE_STATUSES: PaymentSession['status'][] = ['armed', 'wallet_connected', 'approved', 'confirming'];
/** Completed payments older than this are dropped. */
const PAYMENT_RETENTION_MS = 30 * 24 * 3_600_000;
/** Unanswered dashboard charges older than this are dropped. */
const REMOTE_CHARGE_RETENTION_MS = 24 * 3_600_000;
const SAVE_DEBOUNCE_MS = 200;

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

const CUSTOMER_FEE_CENTS = 1;

export class Store {
  readonly events = new EventEmitter();
  catalog: Catalog = seedCatalog();
  settings: TerminalSettings = { ...defaultSettings };
  adminCode = ADMIN_CODE;
  pairingCodes = new Map<string, PairingCode>();
  devices = new Map<string, Device>();
  payments = new Map<string, PaymentSession>();
  remoteCharges = new Map<string, StoredRemoteCharge>();
  /** Tills the dashboard unpaired. Their signed tokens must not come back to life. */
  revokedTills = new Set<string>();
  /** `${tillId}:${Idempotency-Key}` -> payment id. */
  idempotency = new Map<string, string>();
  private timers = new Set<NodeJS.Timeout>();
  private tillCount = 0;
  private saveTimer: NodeJS.Timeout | null = null;
  /** Set by DynkPayments so every charge carries what the customer must send in DYNK. */
  quoter: Quoter | null = null;
  /** Shown in the profile instead of the seed's placeholder once a real receiving wallet is configured. */
  merchantWalletAddress: string | null = null;

  constructor(private opts: StoreOptions = {}) {
    this.load();
  }

  get pairingTtlMs() {
    return this.opts.pairingTtlMs ?? 10 * 60_000;
  }

  get confirmDelayMs() {
    return this.opts.confirmDelayMs ?? 1200;
  }

  dispose() {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.events.removeAllListeners();
    if (this.saveTimer) this.flush();
  }

  // ---------- Persistence ----------

  private load() {
    const file = this.opts.dataFile;
    if (!file || !existsSync(file)) return;
    const snap = JSON.parse(readFileSync(file, 'utf8')) as Snapshot;
    if (snap.version !== 1) throw new Error(`Unsupported data file version ${snap.version}`);
    this.catalog = snap.catalog;
    this.settings = { ...defaultSettings, ...snap.settings };
    this.tillCount = snap.tillCount;
    this.devices = new Map(snap.devices.map((d) => [d.token, d]));
    this.revokedTills = new Set(snap.revokedTills);
    this.payments = new Map(snap.payments.map((p) => [p.id, p]));
    this.remoteCharges = new Map(snap.remoteCharges.map((c) => [c.id, c]));
    this.idempotency = new Map(snap.idempotency);
    this.resumeLivePayments();
  }

  /** Timers don't survive a restart: re-arm expiry for live charges and finish ones mid-confirmation. */
  private resumeLivePayments() {
    for (const p of this.payments.values()) {
      if (p.status === 'armed' || p.status === 'wallet_connected') {
        const left = Date.parse(p.expiresAt) - Date.now();
        if (left <= 0) this.setStatus(p, 'expired');
        else this.scheduleExpiry(p, left);
      } else if (p.status === 'approved' || p.status === 'confirming') {
        this.setStatus(p, 'confirming');
        this.later(this.confirmDelayMs, () => {
          if (p.status === 'confirming') this.setStatus(p, 'paid', { txSignature: fakeBase58(88) });
        });
      }
    }
  }

  snapshot(): Snapshot {
    return {
      version: 1,
      savedAt: new Date().toISOString(),
      catalog: this.catalog,
      settings: this.settings,
      tillCount: this.tillCount,
      devices: [...this.devices.values()],
      revokedTills: [...this.revokedTills],
      payments: [...this.payments.values()],
      remoteCharges: [...this.remoteCharges.values()],
      idempotency: [...this.idempotency],
    };
  }

  /** Something changed: save soon (writes are batched). */
  private changed() {
    if (!this.opts.dataFile || this.saveTimer) return;
    this.saveTimer = setTimeout(() => this.flush(), SAVE_DEBOUNCE_MS);
  }

  /** Write the data file now. Written to a temp file first so a crash can't leave it half-written. */
  flush() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    const file = this.opts.dataFile;
    if (!file) return;
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.snapshot()));
    renameSync(tmp, file);
  }

  /** Drop old pairing codes, payments and dashboard charges so memory (and the data file) stay bounded. */
  prune(now = Date.now()) {
    for (const [code, pc] of this.pairingCodes) {
      // Claimed codes stay around until they'd have expired, so the terminal can still collect its token.
      if (Date.parse(pc.expiresAt) + 60_000 < now) this.pairingCodes.delete(code);
    }
    const dropped = new Set<string>();
    for (const [pid, p] of this.payments) {
      if (FINAL_STATUSES.includes(p.status) && Date.parse(p.completedAt ?? p.createdAt) + PAYMENT_RETENTION_MS < now) {
        this.payments.delete(pid);
        dropped.add(pid);
      }
    }
    for (const [key, pid] of this.idempotency) {
      if (dropped.has(pid) || !this.payments.has(pid)) this.idempotency.delete(key);
    }
    for (const [cid, c] of this.remoteCharges) {
      if (Date.parse(c.sentAt) + REMOTE_CHARGE_RETENTION_MS < now) this.remoteCharges.delete(cid);
    }
  }

  private later(ms: number, fn: () => void) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
  }

  /** Send an event to one till's live connection (the dev panel's pretend phone uses this). */
  sendTo(tillId: string, event: ServerEvent) {
    this.events.emit('event', { tillId, event });
  }

  /** Events go to one till (tillId) or every paired till (null). */
  private emit(tillId: string | null, event: ServerEvent) {
    this.events.emit('event', { tillId, event });
    this.changed();
  }

  // ---------- Pairing ----------

  createPairingCode(): PairingCode {
    this.prune();
    let code = pairingCode();
    while (this.pairingCodes.has(code)) code = pairingCode();
    const pc: PairingCode = {
      code,
      status: 'waiting',
      expiresAt: new Date(Date.now() + this.pairingTtlMs).toISOString(),
    };
    this.pairingCodes.set(code, pc);
    return pc;
  }

  getPairingCode(code: string): PairingCode {
    const pc = this.pairingCodes.get(code.toUpperCase());
    if (!pc) throw new HttpError(404, 'Unknown pairing code');
    if (pc.status === 'waiting' && Date.parse(pc.expiresAt) < Date.now()) pc.status = 'expired';
    return pc;
  }

  claimPairingCode(code: string, tillName?: string): { till: Till; token: string } {
    const pc = this.getPairingCode(code);
    if (pc.status !== 'waiting') throw new HttpError(409, `Pairing code is ${pc.status}`);
    this.tillCount += 1;
    const till: Till = { id: id('till'), name: tillName?.trim() || `Till ${this.tillCount}` };
    const t = this.issueToken(till);
    this.devices.set(t, { token: t, till });
    pc.status = 'claimed';
    pc.token = t;
    if (this.opts.seedActivity ?? true) this.seedHistory(till.id);
    this.changed();
    return { till, token: t };
  }

  /** `<payload>.<hmac>` when a token secret is set, so the token can be checked without stored state. */
  private issueToken(till: Till): string {
    if (!this.opts.tokenSecret) return token();
    const payload = Buffer.from(JSON.stringify({ t: till.id, n: till.name, r: randomBytes(9).toString('base64url') })).toString(
      'base64url',
    );
    return `${payload}.${this.sign(payload)}`;
  }

  private sign(payload: string) {
    return createHmac('sha256', this.opts.tokenSecret!).update(payload).digest('base64url');
  }

  /** A signed token we issued before a restart: bring its till back. */
  private restoreFromToken(t: string): Device | undefined {
    if (!this.opts.tokenSecret) return undefined;
    const [payload, sig] = t.split('.');
    if (!payload || !sig) return undefined;
    const expected = Buffer.from(this.sign(payload));
    const given = Buffer.from(sig);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return undefined;
    let claims: { t?: unknown; n?: unknown };
    try {
      claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
    } catch {
      return undefined;
    }
    if (typeof claims.t !== 'string' || typeof claims.n !== 'string' || this.revokedTills.has(claims.t)) return undefined;
    const existing = [...this.devices.values()].find((d) => d.till.id === claims.t);
    const device: Device = { token: t, till: existing?.till ?? { id: claims.t, name: claims.n } };
    this.devices.set(t, device);
    this.changed();
    return device;
  }

  deviceFor(t: string | undefined, appVersion?: string): Device {
    const d = t ? (this.devices.get(t) ?? this.restoreFromToken(t)) : undefined;
    if (!d) throw new HttpError(401, 'Terminal is not paired');
    if (appVersion && d.appVersion !== appVersion) {
      d.appVersion = appVersion;
      this.changed();
    }
    return d;
  }

  tills(): Till[] {
    return [...this.devices.values()].map((d) => d.till);
  }

  unpair(tillId: string) {
    for (const [t, d] of this.devices) {
      if (d.till.id === tillId) {
        this.emit(tillId, { type: 'terminal.unpaired' });
        this.devices.delete(t);
      }
    }
    this.revokedTills.add(tillId);
    this.changed();
  }

  profile(device: Device): TerminalProfile {
    const { till } = device;
    return {
      merchant: this.merchantWalletAddress ? { ...merchant, walletAddress: this.merchantWalletAddress } : merchant,
      till,
      settings: this.settings,
      serial: 'DK1-' + till.id.slice(-6).toUpperCase(),
      appVersion: device.appVersion ?? 'unknown',
      firmwareVersion: FIRMWARE_VERSION,
    };
  }

  updateSettings(patch: Partial<TerminalSettings>) {
    this.settings = { ...this.settings, ...patch };
    for (const d of this.devices.values()) {
      this.emit(d.till.id, { type: 'settings.updated', profile: this.profile(d) });
    }
  }

  renameTill(tillId: string, name: string) {
    for (const d of this.devices.values()) {
      if (d.till.id === tillId) {
        d.till.name = name;
        this.emit(tillId, { type: 'settings.updated', profile: this.profile(d) });
      }
    }
  }

  /** Name the DYNK app shows the customer. */
  profileMerchantName() {
    return merchant.name;
  }

  verifyAdminCode(pin: string) {
    return pin === this.adminCode;
  }

  // ---------- Catalog ----------

  private catalogChanged() {
    this.catalog.updatedAt = new Date().toISOString();
    this.emit(null, { type: 'catalog.updated', catalog: this.catalog });
  }

  addCategory(input: { name: string; parentId?: string | null }): Category {
    if (!input.name?.trim()) throw new HttpError(400, 'Name is required');
    const parentId = input.parentId ?? null;
    if (parentId && !this.catalog.categories.some((c) => c.id === parentId)) {
      throw new HttpError(400, 'Unknown parent category');
    }
    const siblings = this.catalog.categories.filter((c) => c.parentId === parentId);
    const c: Category = {
      id: id('cat'),
      name: input.name.trim(),
      parentId,
      sort: Math.max(0, ...siblings.map((s) => s.sort)) + 1,
    };
    this.catalog.categories.push(c);
    this.catalogChanged();
    return c;
  }

  updateCategory(categoryId: string, patch: Partial<Pick<Category, 'name' | 'sort'>>): Category {
    const c = this.catalog.categories.find((x) => x.id === categoryId);
    if (!c) throw new HttpError(404, 'Unknown category');
    if (patch.name !== undefined) c.name = patch.name.trim();
    if (patch.sort !== undefined) c.sort = patch.sort;
    this.catalogChanged();
    return c;
  }

  deleteCategory(categoryId: string) {
    const ids = new Set([categoryId]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const c of this.catalog.categories) {
        if (c.parentId && ids.has(c.parentId) && !ids.has(c.id)) {
          ids.add(c.id);
          grew = true;
        }
      }
    }
    if (!this.catalog.categories.some((c) => c.id === categoryId)) throw new HttpError(404, 'Unknown category');
    this.catalog.categories = this.catalog.categories.filter((c) => !ids.has(c.id));
    this.catalog.items = this.catalog.items.filter((i) => !ids.has(i.categoryId));
    this.catalogChanged();
  }

  private normaliseVariants(variants: VariantInput[] | undefined, itemId: string): Variant[] {
    if (!variants?.length) throw new HttpError(400, 'At least one size/price is required');
    return variants.map((v, i) => {
      const price = Number(v.priceCents);
      if (!Number.isInteger(price) || price < 0) throw new HttpError(400, 'Prices must be whole cents');
      return { id: v.id || `${itemId}_v${i + 1}_${Date.now().toString(36)}`, name: v.name?.trim() || 'Regular', priceCents: price };
    });
  }

  addItem(input: AddItemRequest): Item {
    if (!this.catalog.categories.some((c) => c.id === input.categoryId)) throw new HttpError(400, 'Unknown category');
    if (!input.name?.trim()) throw new HttpError(400, 'Name is required');
    const itemId = id('itm');
    const item: Item = {
      id: itemId,
      categoryId: input.categoryId,
      name: input.name.trim(),
      group: input.group?.trim() || undefined,
      variants: this.normaliseVariants(input.variants, itemId),
      sort: Math.max(0, ...this.catalog.items.map((i) => i.sort)) + 1,
    };
    this.catalog.items.push(item);
    this.catalogChanged();
    return item;
  }

  updateItem(itemId: string, patch: UpdateItemRequest): Item {
    const item = this.catalog.items.find((i) => i.id === itemId);
    if (!item) throw new HttpError(404, 'Unknown item');
    if (patch.categoryId !== undefined) {
      if (!this.catalog.categories.some((c) => c.id === patch.categoryId)) throw new HttpError(400, 'Unknown category');
      item.categoryId = patch.categoryId;
    }
    if (patch.name !== undefined) item.name = patch.name.trim();
    if (patch.group !== undefined) item.group = patch.group?.trim() || undefined;
    if (patch.sort !== undefined) item.sort = patch.sort;
    if (patch.variants !== undefined) item.variants = this.normaliseVariants(patch.variants, itemId);
    this.catalogChanged();
    return item;
  }

  deleteItem(itemId: string) {
    const before = this.catalog.items.length;
    this.catalog.items = this.catalog.items.filter((i) => i.id !== itemId);
    if (this.catalog.items.length === before) throw new HttpError(404, 'Unknown item');
    this.catalogChanged();
  }

  // ---------- Payments ----------

  createPayment(
    tillId: string,
    req: CreatePaymentRequest,
    baseUrl: string,
    source: PaymentSession['source'] = 'terminal',
    idempotencyKey?: string,
  ): PaymentSession {
    // A retry of a request we already handled (the terminal timed out waiting for the reply): same payment back.
    const idemKey = idempotencyKey ? `${tillId}:${idempotencyKey}` : undefined;
    const earlier = idemKey ? this.payments.get(this.idempotency.get(idemKey) ?? '') : undefined;
    if (earlier) return earlier;

    this.prune();
    const subtotal = Math.round(Number(req.subtotalCents));
    const tip = Math.round(Number(req.tipCents ?? 0));
    if (!Number.isFinite(subtotal) || subtotal <= 0) throw new HttpError(400, 'Amount must be more than zero');
    if (!Number.isFinite(tip) || tip < 0) throw new HttpError(400, 'Tip must not be negative');

    // Only one live charge per till: a new one supersedes the old.
    for (const p of this.payments.values()) {
      if (p.tillId === tillId && !FINAL_STATUSES.includes(p.status)) this.setStatus(p, 'cancelled');
    }

    const paymentId = id('pay');
    const total = subtotal + tip;
    const solanaPayUrl = `solana:${encodeURIComponent(`${baseUrl}/solana-pay/${paymentId}`)}`;
    const qrUrl = `https://pay.dynk.io/p/${paymentId}?r=${encodeURIComponent(solanaPayUrl)}`;
    const now = Date.now();
    const p: PaymentSession = {
      id: paymentId,
      tillId,
      status: 'armed',
      source,
      reference: req.reference,
      lines: req.lines ?? [],
      subtotalCents: subtotal,
      tipCents: tip,
      totalCents: total,
      gstCents: gstIncluded(subtotal),
      customerFeeCents: CUSTOMER_FEE_CENTS,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + this.settings.priceLockSeconds * 1000).toISOString(),
      qrUrl,
      ndefUrl: qrUrl,
      solanaPayUrl,
    };
    const dynk = this.quoter?.(total, tillId);
    if (dynk) p.dynk = dynk;
    this.payments.set(p.id, p);
    if (idemKey) this.idempotency.set(idemKey, p.id);
    this.emit(tillId, { type: 'payment.status', payment: p });
    this.scheduleExpiry(p, this.settings.priceLockSeconds * 1000);
    return p;
  }

  private scheduleExpiry(p: PaymentSession, ms: number) {
    this.later(ms, () => {
      if (p.status === 'armed' || p.status === 'wallet_connected') this.setStatus(p, 'expired');
    });
  }

  getPayment(paymentId: string): PaymentSession {
    const p = this.payments.get(paymentId);
    if (!p) throw new HttpError(404, 'Unknown payment');
    return p;
  }

  /** Resolves "latest" to the most recent live payment, for the dev panel and scripted tests. */
  resolvePayment(paymentId: string): PaymentSession {
    if (paymentId !== 'latest') return this.getPayment(paymentId);
    const live = [...this.payments.values()].filter((p) => LIVE_STATUSES.includes(p.status));
    const p = live.at(-1);
    if (!p) throw new HttpError(404, 'No live payment');
    return p;
  }

  /** Status change from outside the store (the DYNK Bluetooth payment service). */
  transition(p: PaymentSession, status: PaymentSession['status'], patch: Partial<PaymentSession> = {}) {
    this.setStatus(p, status, patch);
  }

  private setStatus(p: PaymentSession, status: PaymentSession['status'], patch: Partial<PaymentSession> = {}) {
    Object.assign(p, patch, { status });
    if (FINAL_STATUSES.includes(status)) p.completedAt = new Date().toISOString();
    this.emit(p.tillId, { type: 'payment.status', payment: p });
  }

  private requireLive(p: PaymentSession, allowed: PaymentSession['status'][]) {
    if (!allowed.includes(p.status)) throw new HttpError(409, `Payment is ${p.status}`);
  }

  cancelPayment(paymentId: string) {
    const p = this.getPayment(paymentId);
    if (FINAL_STATUSES.includes(p.status)) return p;
    this.setStatus(p, 'cancelled');
    return p;
  }

  connectWallet(paymentId: string, method: PaymentMethod, wallet?: string) {
    const p = this.resolvePayment(paymentId);
    this.requireLive(p, ['armed', 'wallet_connected']);
    this.setStatus(p, 'wallet_connected', { method, customerWallet: wallet ?? `${fakeBase58(4)}…${fakeBase58(4)}` });
    return p;
  }

  approve(paymentId: string) {
    const p = this.resolvePayment(paymentId);
    if (p.status === 'armed') this.connectWallet(p.id, { wallet: 'DYNK app', channel: 'tap' });
    this.requireLive(p, ['wallet_connected']);
    this.setStatus(p, 'approved');
    this.later(this.confirmDelayMs / 3, () => {
      if (p.status !== 'approved') return;
      this.setStatus(p, 'confirming');
      this.later(this.confirmDelayMs, () => {
        if (p.status === 'confirming') this.setStatus(p, 'paid', { txSignature: fakeBase58(88) });
      });
    });
    return p;
  }

  decline(paymentId: string, reason = 'The customer declined in their wallet.') {
    const p = this.resolvePayment(paymentId);
    this.requireLive(p, ['armed', 'wallet_connected', 'approved', 'confirming']);
    this.setStatus(p, 'failed', { failureReason: reason });
    return p;
  }

  expire(paymentId: string) {
    const p = this.resolvePayment(paymentId);
    this.requireLive(p, ['armed', 'wallet_connected']);
    this.setStatus(p, 'expired');
    return p;
  }

  transactions(tillId: string): TransactionsResponse {
    // "Today" is the merchant's day, not the server's (which runs in UTC).
    const startOfDay = startOfDayIn(merchant.timezone);
    const list = [...this.payments.values()]
      .filter((p) => p.tillId === tillId && ['paid', 'failed', 'expired'].includes(p.status))
      .filter((p) => Date.parse(p.createdAt) >= startOfDay)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    const paid = list.filter((p) => p.status === 'paid');
    return {
      totalPaidCents: paid.reduce((s, p) => s + p.totalCents, 0),
      paidCount: paid.length,
      failedCount: list.filter((p) => p.status === 'failed').length,
      expiredCount: list.filter((p) => p.status === 'expired').length,
      transactions: list,
    };
  }

  // ---------- Remote charges (sent from the dashboard) ----------

  sendRemoteCharge(input: RemoteChargeRequest) {
    const tillId = input.tillId || this.tills()[0]?.id;
    if (!tillId) throw new HttpError(400, 'No paired terminal');
    const amount = Math.round(Number(input.amountCents));
    if (!(amount > 0)) throw new HttpError(400, 'Amount must be more than zero');
    const charge: StoredRemoteCharge = {
      id: id('rc'),
      tillId,
      amountCents: amount,
      reference: input.reference?.trim() || 'Dashboard charge',
      sentBy: input.sentBy?.trim() || 'the front counter',
      sentAt: new Date().toISOString(),
      lines: [],
      state: 'pending',
    };
    this.remoteCharges.set(charge.id, charge);
    this.emit(tillId, { type: 'remote_charge', charge: toWire(charge) });
    return charge;
  }

  /** Charges the dashboard sent that this till hasn't answered yet (replayed when it reconnects). */
  pendingRemoteCharges(tillId: string): RemoteCharge[] {
    return [...this.remoteCharges.values()].filter((c) => c.tillId === tillId && c.state === 'pending').map(toWire);
  }

  acceptRemoteCharge(chargeId: string, tillId: string, baseUrl: string): PaymentSession {
    const c = this.remoteCharges.get(chargeId);
    if (!c || c.tillId !== tillId) throw new HttpError(404, 'Unknown remote charge');
    // Accepting twice (a retried request) returns the payment the first accept created.
    if (c.state === 'accepted' && c.paymentId && this.payments.has(c.paymentId)) return this.getPayment(c.paymentId);
    if (c.state !== 'pending') throw new HttpError(409, `Remote charge is ${c.state}`);
    c.state = 'accepted';
    const payment = this.createPayment(
      tillId,
      { lines: c.lines, subtotalCents: c.amountCents, tipCents: 0, reference: c.reference },
      baseUrl,
      'dashboard',
    );
    c.paymentId = payment.id;
    return payment;
  }

  dismissRemoteCharge(chargeId: string, tillId: string) {
    const c = this.remoteCharges.get(chargeId);
    if (!c || c.tillId !== tillId) throw new HttpError(404, 'Unknown remote charge');
    c.state = 'dismissed';
    this.changed();
  }

  softwareUpdate(version: string) {
    this.emit(null, { type: 'software_update', version });
  }

  // ---------- Sample history ----------

  private seedHistory(tillId: string) {
    const at = (h: number, m: number) => {
      let t = todayAt(merchant.timezone, h, m);
      // Keep sample history in the past (and still today) even when paired early in the morning.
      if (t > Date.now()) t = Math.max(startOfDayIn(merchant.timezone), Date.now() - (14 - h) * 60_000 - m * 1000);
      return new Date(t).toISOString();
    };
    const line = (name: string, detail: string, unitCents: number, qty = 1): OrderLine => ({
      id: id('ln'),
      kind: name === 'Custom amount' ? 'custom' : 'item',
      name,
      detail,
      unitCents,
      qty,
    });
    const samples: Array<Partial<PaymentSession> & { lines: OrderLine[] }> = [
      {
        createdAt: at(12, 40),
        status: 'paid',
        lines: [line('Chai latte', 'Small', 500)],
        method: { wallet: 'DYNK app', channel: 'bluetooth' },
      },
      { createdAt: at(12, 47), status: 'expired', lines: [line('Mocha', 'Small', 530), line('Croissant', 'Regular', 550)] },
      {
        createdAt: at(12, 51),
        status: 'failed',
        lines: [line('Flat white', 'Small', 480)],
        method: { wallet: 'Solflare', channel: 'qr' },
        failureReason: 'The customer declined in their wallet.',
      },
      {
        createdAt: at(13, 2),
        status: 'paid',
        source: 'dashboard',
        reference: 'Table 4',
        lines: [],
        subtotalCents: 3600,
        method: { wallet: 'DYNK app', channel: 'qr' },
      },
      {
        createdAt: at(13, 9),
        status: 'paid',
        lines: [line('Custom amount', 'Keyed in', 840)],
        method: { wallet: 'Phantom', channel: 'qr' },
      },
      {
        createdAt: at(13, 14),
        status: 'paid',
        tipCents: 210,
        lines: [line('Latte', 'Medium', 550, 2), line('Banana bread', 'Food · Breads', 550), line('Custom amount', 'Keyed in', 450)],
        method: { wallet: 'DYNK app', channel: 'tap' },
      },
    ];
    for (const s of samples) {
      const subtotal = s.subtotalCents ?? s.lines.reduce((sum, l) => sum + l.unitCents * l.qty, 0);
      const tip = s.tipCents ?? 0;
      const pid = id('pay');
      const p: PaymentSession = {
        id: pid,
        tillId,
        status: s.status!,
        source: s.source ?? 'terminal',
        reference: s.reference,
        lines: s.lines,
        subtotalCents: subtotal,
        tipCents: tip,
        totalCents: subtotal + tip,
        gstCents: gstIncluded(subtotal),
        customerFeeCents: CUSTOMER_FEE_CENTS,
        createdAt: s.createdAt!,
        completedAt: s.createdAt,
        expiresAt: s.createdAt!,
        qrUrl: '',
        ndefUrl: '',
        solanaPayUrl: '',
        method: s.method,
        customerWallet: s.method ? `${fakeBase58(4)}…${fakeBase58(4)}` : undefined,
        failureReason: s.failureReason,
        txSignature: s.status === 'paid' ? fakeBase58(88) : undefined,
      };
      this.payments.set(pid, p);
    }
  }
}

function toWire({ tillId: _t, state: _s, paymentId: _p, ...wire }: StoredRemoteCharge): RemoteCharge {
  return wire;
}
