import { api, ApiError, request } from '@/api/client';
import { useSession } from '@/state/session';

const json = (status: number, body: unknown) =>
  Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) } as Response);

let fetchMock: jest.Mock;
beforeEach(() => {
  jest.useFakeTimers();
  fetchMock = jest.fn();
  globalThis.fetch = fetchMock;
  useSession.setState({ phase: 'paired', token: 'tok', apiUrl: 'http://dash' });
});
afterEach(() => {
  jest.useRealTimers();
});

/** Lets pending timers (backoff, timeout) run while a request is in flight. */
async function settle<T>(p: Promise<T>): Promise<T> {
  let done = false;
  p.finally(() => (done = true)).catch(() => undefined);
  while (!done) await jest.advanceTimersByTimeAsync(500);
  return p;
}

describe('api client', () => {
  it('sends the device token and app version', async () => {
    fetchMock.mockReturnValue(json(200, { success: true }));
    await api.unpair();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://dash/api/terminals/me/unpair');
    expect(init.headers.authorization).toBe('Bearer tok');
    expect(init.headers['x-dynkle-app-version']).toBeTruthy();
  });

  it('gives up on a request that hangs, instead of freezing checkout', async () => {
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted')))),
    );
    const p = request('POST', '/terminal/unpair');
    await expect(settle(p)).rejects.toMatchObject({ status: 0, message: 'The Dynkle dashboard took too long to answer' });
    expect(fetchMock).toHaveBeenCalledTimes(1); // POSTs without an idempotency key are not retried
  });

  it('retries a charge with the same idempotency key until it gets through', async () => {
    const order = {
      id: 'pay_1',
      totalCents: 500,
      currency: 'AUD',
      status: 'OPEN',
      expiresAt: new Date().toISOString(),
      ttlSeconds: 90,
      claimed: false,
      paymentUrl: 'solana:pay',
      acceptedTokens: ['USDC'],
    };
    fetchMock
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockReturnValue(json(200, { order }));
    const p = api.createPayment({ lines: [], subtotalCents: 500, tipCents: 0 }, 'key-1');
    await expect(settle(p)).resolves.toMatchObject({ id: 'pay_1', totalCents: 500, status: 'armed' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const keys = fetchMock.mock.calls.map(([, init]) => init.headers['idempotency-key']);
    expect(keys).toEqual(['key-1', 'key-1', 'key-1']);
  });

  it('marks the terminal unpaired when the dashboard no longer knows its token', async () => {
    fetchMock.mockReturnValue(json(401, { error: 'Terminal is not paired' }));
    await expect(api.transactions()).rejects.toBeInstanceOf(ApiError);
    expect(useSession.getState().phase).toBe('unpaired');
  });

  it('does not unpair the terminal over a wrong admin PIN', async () => {
    fetchMock.mockReturnValue(json(401, { error: 'Invalid PIN' }));
    await expect(api.verifyAdmin('0000')).resolves.toEqual({ ok: false });
    expect(useSession.getState().phase).toBe('paired');
  });

  it('passes the dashboard error message through', async () => {
    fetchMock.mockReturnValue(json(409, { error: 'Payment is paid' }));
    await expect(api.cancelPayment('pay_1')).rejects.toMatchObject({ status: 409, message: 'Payment is paid' });
  });
});
