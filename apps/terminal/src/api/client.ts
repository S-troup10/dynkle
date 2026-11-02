import {
  APP_VERSION_HEADER,
  IDEMPOTENCY_HEADER,
  type AddItemRequest,
  type Catalog,
  type Category,
  type CreatePaymentRequest,
  type Item,
  type LogEntry,
  type PairingCode,
  type PaymentSession,
  type TerminalProfile,
  type TransactionsResponse,
  type UpdateItemRequest,
  type VariantInput,
} from '@dynkle/shared';
import { APP_VERSION } from '@/lib/config';
import { log } from '@/lib/logger';
import { useSession } from '@/state/session';

export class ApiError extends Error {
  constructor(
    /** HTTP status, or 0 when the dashboard couldn't be reached (offline, timed out). */
    public status: number,
    message: string,
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

export async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const retry = opts.retry ?? (method === 'GET' || !!opts.idempotencyKey);
  let res: Response | undefined;
  for (let attempt = 0; ; attempt++) {
    try {
      res = await once(method, path, opts);
      break;
    } catch (e) {
      const err = e as ApiError;
      if (!retry || attempt >= RETRY_DELAYS_MS.length) {
        log.warn('Request failed', { method, path, error: err.message, attempts: attempt + 1 });
        throw err;
      }
      await wait(RETRY_DELAYS_MS[attempt]);
    }
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = (json as { error?: string }).error ?? `Request failed (${res.status})`;
    log.warn('Request rejected', { method, path, status: res.status, error: message });
    if (res.status === 401 && (opts.auth ?? true) && !opts.token && useSession.getState().token) {
      useSession.getState().markUnpaired();
    }
    throw new ApiError(res.status, message);
  }
  return json as T;
}

export type { VariantInput };

export const api = {
  health: () => request<{ ok: boolean }>('GET', '/health', { auth: false }),
  createPairingCode: () => request<PairingCode>('POST', '/pairing/codes', { auth: false }),
  pollPairingCode: (code: string) => request<PairingCode>('GET', `/pairing/codes/${code}`, { auth: false, retry: false }),
  me: (token?: string) => request<TerminalProfile>('GET', '/terminal/me', { token }),
  unpair: () => request<{ ok: boolean }>('POST', '/terminal/unpair'),
  verifyAdmin: (pin: string) => request<{ ok: boolean }>('POST', '/admin/verify', { body: { pin } }),
  uploadLogs: (entries: readonly LogEntry[]) =>
    request<{ ok: boolean; received: number }>('POST', '/terminal/logs', { body: { entries }, timeoutMs: 20_000 }),

  catalog: () => request<Catalog>('GET', '/catalog'),
  addCategory: (name: string, parentId: string | null) => request<Category>('POST', '/catalog/categories', { body: { name, parentId } }),
  updateCategory: (id: string, patch: { name?: string }) => request<Category>('PATCH', `/catalog/categories/${id}`, { body: patch }),
  deleteCategory: (id: string) => request<{ ok: boolean }>('DELETE', `/catalog/categories/${id}`),
  addItem: (input: AddItemRequest) => request<Item>('POST', '/catalog/items', { body: input }),
  updateItem: (id: string, patch: UpdateItemRequest) => request<Item>('PATCH', `/catalog/items/${id}`, { body: patch }),
  deleteItem: (id: string) => request<{ ok: boolean }>('DELETE', `/catalog/items/${id}`),

  /** Pass the same key when retrying the same charge: the dashboard returns the original payment. */
  createPayment: (input: CreatePaymentRequest, idempotencyKey: string) =>
    request<PaymentSession>('POST', '/payments', { body: input, idempotencyKey }),
  getPayment: (id: string) => request<PaymentSession>('GET', `/payments/${id}`),
  cancelPayment: (id: string) => request<PaymentSession>('POST', `/payments/${id}/cancel`, { retry: true }),
  transactions: () => request<TransactionsResponse>('GET', '/transactions'),
  // Accept and dismiss are safe to retry: the dashboard answers a repeat with the same result.
  acceptRemoteCharge: (id: string) => request<PaymentSession>('POST', `/remote-charges/${id}/accept`, { retry: true }),
  dismissRemoteCharge: (id: string) => request<{ ok: boolean }>('POST', `/remote-charges/${id}/dismiss`, { retry: true }),
};
