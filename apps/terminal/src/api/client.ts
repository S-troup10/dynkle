import type {
  Catalog,
  Category,
  CreatePaymentRequest,
  Item,
  PairingCode,
  PaymentSession,
  TerminalProfile,
  TransactionsResponse,
  Variant,
} from '@dynkle/shared';
import { useSession } from '@/state/session';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown, auth = true, tokenOverride?: string): Promise<T> {
  const { apiUrl } = useSession.getState();
  const token = tokenOverride ?? useSession.getState().token;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (auth && token) headers.authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`${apiUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, "Can't reach the Dynkle dashboard");
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && auth && token && !tokenOverride) useSession.getState().markUnpaired();
    throw new ApiError(res.status, (json as { error?: string }).error ?? `Request failed (${res.status})`);
  }
  return json as T;
}

export type VariantInput = Pick<Variant, 'name' | 'priceCents'> & { id?: string };

export const api = {
  health: () => request<{ ok: boolean }>('GET', '/health', undefined, false),
  createPairingCode: () => request<PairingCode>('POST', '/pairing/codes', undefined, false),
  pollPairingCode: (code: string) => request<PairingCode>('GET', `/pairing/codes/${code}`, undefined, false),
  me: (token?: string) => request<TerminalProfile>('GET', '/terminal/me', undefined, true, token),
  unpair: () => request<{ ok: boolean }>('POST', '/terminal/unpair'),
  verifyAdmin: (pin: string) => request<{ ok: boolean }>('POST', '/admin/verify', { pin }),

  catalog: () => request<Catalog>('GET', '/catalog'),
  addCategory: (name: string, parentId: string | null) => request<Category>('POST', '/catalog/categories', { name, parentId }),
  updateCategory: (id: string, patch: { name?: string }) => request<Category>('PATCH', `/catalog/categories/${id}`, patch),
  deleteCategory: (id: string) => request<{ ok: boolean }>('DELETE', `/catalog/categories/${id}`),
  addItem: (input: { categoryId: string; name: string; group?: string; variants: VariantInput[] }) =>
    request<Item>('POST', '/catalog/items', input),
  updateItem: (id: string, patch: { name?: string; group?: string; categoryId?: string; variants?: VariantInput[] }) =>
    request<Item>('PATCH', `/catalog/items/${id}`, patch),
  deleteItem: (id: string) => request<{ ok: boolean }>('DELETE', `/catalog/items/${id}`),

  createPayment: (input: CreatePaymentRequest) => request<PaymentSession>('POST', '/payments', input),
  getPayment: (id: string) => request<PaymentSession>('GET', `/payments/${id}`),
  cancelPayment: (id: string) => request<PaymentSession>('POST', `/payments/${id}/cancel`),
  transactions: () => request<TransactionsResponse>('GET', '/transactions'),
  acceptRemoteCharge: (id: string) => request<PaymentSession>('POST', `/remote-charges/${id}/accept`),
  dismissRemoteCharge: (id: string) => request<{ ok: boolean }>('POST', `/remote-charges/${id}/dismiss`),
};
