import {
  APP_VERSION_HEADER,
  IDEMPOTENCY_HEADER,
  type AddItemRequest,
  type BleSenderMessage,
  type BleSessionV2,
  type Catalog,
  type Category,
  type Item,
  type LogEntry,
  type OrderLine,
  type PaymentSession,
  type UpdateItemRequest,
  type VariantInput,
} from '@dynkle/shared';
import { APP_VERSION } from '@/lib/config';
import { getDevicePublicKeySpki } from '@/lib/deviceKey';
import { log } from '@/lib/logger';
import { useSession } from '@/state/session';
import { refreshDeviceToken } from './deviceAuth';
import { type BackendCatalogDto, type BackendOrderDto, linesToOrderItems, mapCatalog, mapOrderToPayment } from './mapping';

export class ApiError extends Error {
  constructor(
    /** HTTP status, or 0 when the dashboard couldn't be reached (offline, timed out). */
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export const REQUEST_TIMEOUT_MS = 10_000;
const RETRY_DELAYS_MS = [400, 1200];

export interface RequestOptions {
  body?: unknown;
  /** Send the device token (default true). */
  auth?: boolean;
  /** Use this token instead of the stored one (during pairing). */
  token?: string;
  /** Sent as Idempotency-Key so the request is safe to retry. */
  idempotencyKey?: string;
  /** Retry when the dashboard can't be reached. Defaults to GETs and idempotent requests only. */
  retry?: boolean;
  timeoutMs?: number;
  /**
   * A 401 from this call means something other than "this device's token is bad"
   * (e.g. a staff PIN check) — don't bounce the terminal back to pairing over it.
   * The caller handles its own 401 instead.
   */
  authFailureIsLocal?: boolean;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A random id for Idempotency-Key. Hermes has no crypto.randomUUID, so fall back to Math.random. */
export function newRequestId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}-${Math.random().toString(36).slice(2, 12)}`;
}

async function once(method: string, path: string, opts: RequestOptions): Promise<Response> {
  const { apiUrl, token: stored } = useSession.getState();
  const token = opts.token ?? stored;
  const headers: Record<string, string> = { [APP_VERSION_HEADER]: APP_VERSION };
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  if ((opts.auth ?? true) && token) headers.authorization = `Bearer ${token}`;
  if (opts.idempotencyKey) headers[IDEMPOTENCY_HEADER] = opts.idempotencyKey;

  // Without a timeout a request on a dead network can hang for minutes and freeze checkout.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${apiUrl}${path}`, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: controller.signal,
    });
  } catch {
    const timedOut = controller.signal.aborted;
    throw new ApiError(0, timedOut ? 'The Dynkle dashboard took too long to answer' : "Can't reach the Dynkle dashboard");
  } finally {
    clearTimeout(timer);
  }
}

async function attempt(method: string, path: string, opts: RequestOptions): Promise<Response> {
  const retry = opts.retry ?? (method === 'GET' || !!opts.idempotencyKey);
  for (let n = 0; ; n++) {
    try {
      return await once(method, path, opts);
    } catch (e) {
      const err = e as ApiError;
      if (!retry || n >= RETRY_DELAYS_MS.length) {
        log.warn('Request failed', { method, path, error: err.message, attempts: n + 1 });
        throw err;
      }
      await wait(RETRY_DELAYS_MS[n]);
    }
  }
}

export async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  let res = await attempt(method, path, opts);
  let json = await res.json().catch(() => ({}));

  // A device token lasts 15 minutes (DEVICE_TOKEN_TTL_SECONDS); re-authenticate with the
  // stored keypair and retry once, rather than bouncing the terminal back to pairing.
  if (!res.ok && res.status === 401 && (opts.auth ?? true) && !opts.token && (json as { error?: string }).error === 'TOKEN_EXPIRED') {
    try {
      await refreshDeviceToken();
      res = await attempt(method, path, opts);
      json = await res.json().catch(() => ({}));
    } catch {
      // The device itself is gone or revoked: fall through to the normal 401 handling below.
    }
  }

  if (!res.ok) {
    const message =
      (json as { message?: string; error?: string }).message ?? (json as { error?: string }).error ?? `Request failed (${res.status})`;
    const code = (json as { error?: string }).error;
    log.warn('Request rejected', { method, path, status: res.status, error: message });
    if (res.status === 401 && (opts.auth ?? true) && !opts.token && !opts.authFailureIsLocal && useSession.getState().token) {
      useSession.getState().markUnpaired();
    }
    throw new ApiError(res.status, message, code);
  }
  return json as T;
}

export type { VariantInput };

export interface PairResult {
  deviceId: string;
  deviceLabel: string;
  serialNumber: string | null;
  token: string;
  merchantId: string;
  terminalId: string;
  terminalCode: string;
  counterLabel: string;
  merchantName: string;
  currency: string;
}

export const api = {
  health: () => request<{ ok: boolean }>('GET', '/health', { auth: false }),

  /** Pairs this device with a counter using a dashboard-issued code, generating this device's keypair on first use. */
  pair: async (code: string, deviceInfo?: Record<string, unknown>): Promise<PairResult> => {
    const publicKey = await getDevicePublicKeySpki();
    return request<PairResult>('POST', '/api/terminals/pair', { auth: false, body: { code, publicKey, deviceInfo } });
  },
  unpair: () => request<{ success: boolean }>('POST', '/api/terminals/me/unpair'),
  verifyAdmin: async (pin: string): Promise<{ ok: boolean }> => {
    try {
      await request<{ valid: boolean }>('POST', '/api/terminals/me/staff/verify', { body: { pin }, authFailureIsLocal: true });
      return { ok: true };
    } catch (e) {
      if ((e as ApiError).status === 401) return { ok: false };
      throw e;
    }
  },
  uploadLogs: async (entries: readonly LogEntry[]): Promise<{ ok: boolean; received: number }> => {
    const { count } = await request<{ received: boolean; count: number }>('POST', '/api/terminals/me/logs', {
      body: { logs: entries },
      timeoutMs: 20_000,
    });
    return { ok: true, received: count };
  },

  catalog: async (): Promise<Catalog> => mapCatalog(await request<BackendCatalogDto>('GET', '/api/terminals/me/catalog')),
  /** The backend only manages categories through products; there's nothing to create or rename on its own yet. */
  addCategory: (_name: string, _parentId: string | null): Promise<Category> =>
    Promise.reject(new ApiError(501, 'Categories come from products on this backend — add an item instead.')),
  updateCategory: (_id: string, _patch: { name?: string }): Promise<Category> =>
    Promise.reject(new ApiError(501, 'Renaming a category is not supported by this backend yet.')),
  deleteCategory: (_id: string): Promise<{ ok: boolean }> =>
    Promise.reject(new ApiError(501, 'Deleting a category is not supported by this backend yet.')),
  addItem: async (input: AddItemRequest): Promise<Item> => {
    const variant = input.variants[0];
    const { product } = await request<{
      product: { id: string; name: string; category: string; priceCents: number; variants: { name: string; priceCents: number }[] };
    }>('POST', '/api/terminals/me/products', {
      body: { name: input.name, priceCents: variant?.priceCents ?? 0, category: input.categoryId, pin: '1234' },
    });
    return {
      id: product.id,
      categoryId: product.category,
      name: product.name,
      variants: [{ id: product.id, name: 'Regular', priceCents: product.priceCents }],
      sort: 0,
    };
  },
  updateItem: (_id: string, _patch: UpdateItemRequest): Promise<Item> =>
    Promise.reject(new ApiError(501, 'Editing an item is not supported by this backend yet.')),
  deleteItem: (_id: string): Promise<{ ok: boolean }> =>
    Promise.reject(new ApiError(501, 'Deleting an item is not supported by this backend yet.')),

  /** This backend doesn't key off Idempotency-Key yet; it's still sent so a retried request is visibly the same attempt. */
  createPayment: async (
    input: { lines: OrderLine[]; subtotalCents: number; tipCents: number; reference?: string },
    idempotencyKey: string,
  ): Promise<PaymentSession> => {
    const items = linesToOrderItems(input.lines);
    const body = items ? { items, tipCents: input.tipCents } : { totalCents: input.subtotalCents, tipCents: input.tipCents };
    const { order } = await request<{ order: BackendOrderDto }>('POST', '/api/terminals/me/orders', { body, idempotencyKey });
    return mapOrderToPayment(order, {
      tillId: useSession.getState().profile?.till.id ?? '',
      lines: input.lines,
      subtotalCents: input.subtotalCents,
      reference: input.reference,
      source: 'terminal',
    });
  },
  /** No single-order lookup on the device API; the active order is this counter's only open one. */
  getPayment: async (id: string): Promise<PaymentSession> => {
    const { order } = await request<{ order: BackendOrderDto | null }>('GET', '/api/terminals/me/active-order');
    if (!order || order.id !== id) throw new ApiError(404, 'Order not found');
    return mapOrderToPayment(order, {
      tillId: useSession.getState().profile?.till.id ?? '',
      lines: [],
      subtotalCents: order.totalCents - (order.tipCents ?? 0),
      source: 'terminal',
    });
  },
  cancelPayment: (id: string) =>
    request<{ success: boolean; orderId: string; status: string }>('POST', `/api/terminals/me/orders/${id}/cancel`, { retry: true }),
  transactions: async () => {
    const { orders } = await request<{
      orders: { id: string; totalCents: number; status: BackendOrderDto['status']; createdAt: string }[];
    }>('GET', '/api/terminals/me/orders?limit=50');
    const totalPaidCents = orders.filter((o) => o.status === 'PAID').reduce((sum, o) => sum + o.totalCents, 0);
    return {
      totalPaidCents,
      paidCount: orders.filter((o) => o.status === 'PAID').length,
      failedCount: orders.filter((o) => o.status === 'FAILED').length,
      expiredCount: orders.filter((o) => o.status === 'EXPIRED').length,
      transactions: orders.map((o) =>
        mapOrderToPayment(
          { ...o, currency: 'AUD', expiresAt: o.createdAt, ttlSeconds: 0, claimed: false, paymentUrl: '', acceptedTokens: [] },
          { tillId: useSession.getState().profile?.till.id ?? '', lines: [], subtotalCents: o.totalCents, source: 'terminal' },
        ),
      ),
    };
  },

  // The rest of the Bluetooth Tap to Pay / dashboard-remote-charge surface below has no
  // counterpart on this backend yet. Left in place (unused — gated on `payment.dynk`,
  // which this client never sets) so lib/tapToPay.ts and RemoteChargeOverlay still compile.
  acceptRemoteCharge: (id: string) => request<PaymentSession>('POST', `/remote-charges/${id}/accept`, { retry: true }),
  bleSession: (paymentId: string) =>
    request<{ session: BleSessionV2; wire: string; minRemainingMs: number }>('POST', `/payments/${paymentId}/ble-session`),
  bleEvent: (paymentId: string, event: 'read' | 'processing' | 'failed' | 'disconnected', device?: string, message?: BleSenderMessage) =>
    request<PaymentSession>('POST', `/payments/${paymentId}/ble-event`, { body: { event, device, message }, retry: true }),
  claimSignature: (paymentId: string, txSignature: string, device?: string) =>
    request<PaymentSession>('POST', `/payments/${paymentId}/claim-signature`, { body: { txSignature, device }, retry: true }),
  dismissRemoteCharge: (id: string) => request<{ ok: boolean }>('POST', `/remote-charges/${id}/dismiss`, { retry: true }),
};
