import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '@/api/client';
import { useCheckout } from '@/state/checkout';
import { useSession } from '@/state/session';
import { payment, profile } from '@/__fixtures__/payments';

jest.mock('@/api/client', () => ({
  ...jest.requireActual('@/api/client'),
  api: { createPayment: jest.fn(), getPayment: jest.fn(), cancelPayment: jest.fn() },
}));

const mocked = api as jest.Mocked<typeof api>;
const flush = () => new Promise<void>((r) => setImmediate(() => r()));

beforeEach(async () => {
  await AsyncStorage.clear();
  useSession.setState({ phase: 'paired', token: 't', profile });
  useCheckout.setState({ payment: null, draft: null, tipCents: 0, busy: false, error: null });
});

describe('checkout store', () => {
  it('arms a charge with a fresh idempotency key each attempt', async () => {
    mocked.createPayment.mockResolvedValue(payment());
    useCheckout.getState().begin({ lines: [], subtotalCents: 2100, source: 'terminal' });
    await useCheckout.getState().arm(315);
    await useCheckout.getState().arm(315);
    const [k1, k2] = mocked.createPayment.mock.calls.map((c) => c[1]);
    expect(k1).toBeTruthy();
    expect(k1).not.toBe(k2);
  });

  it('saves the sale in progress and restores it after a restart', async () => {
    mocked.createPayment.mockResolvedValue(payment());
    useCheckout.getState().begin({ lines: [], subtotalCents: 2100, source: 'terminal' });
    await useCheckout.getState().arm(315);
    await flush();
    expect(await AsyncStorage.getItem('dynkle.checkout')).toContain('pay_1');

    // Cold start: memory is empty but the saved copy is on disk. Meanwhile the customer paid.
    // (Clearing state here counts as finishing the sale and drops the saved copy, so write it back.)
    useCheckout.setState({ payment: null, draft: null });
    await flush();
    await AsyncStorage.setItem(
      'dynkle.checkout',
      JSON.stringify({ paymentId: 'pay_1', tipCents: 315, draft: { lines: [], subtotalCents: 2100, source: 'terminal' } }),
    );
    mocked.getPayment.mockResolvedValue(payment({ status: 'paid' }));
    expect(await useCheckout.getState().restore()).toBe(true);
    expect(useCheckout.getState().payment?.status).toBe('paid');
    expect(useCheckout.getState().tipCents).toBe(315);
  });

  it('forgets a saved sale that ended while the app was down', async () => {
    await AsyncStorage.setItem(
      'dynkle.checkout',
      JSON.stringify({ paymentId: 'pay_1', tipCents: 0, draft: { lines: [], subtotalCents: 2100, source: 'terminal' } }),
    );
    mocked.getPayment.mockResolvedValue(payment({ status: 'expired' }));
    expect(await useCheckout.getState().restore()).toBe(false);
    expect(await AsyncStorage.getItem('dynkle.checkout')).toBeNull();
  });

  it('clears the saved sale once it is finished', async () => {
    mocked.createPayment.mockResolvedValue(payment());
    useCheckout.getState().begin({ lines: [], subtotalCents: 2100, source: 'terminal' });
    await useCheckout.getState().arm(0);
    await flush();
    useCheckout.getState().finish(true);
    await flush();
    expect(await AsyncStorage.getItem('dynkle.checkout')).toBeNull();
  });

  it('refreshes a live payment from the dashboard', async () => {
    useCheckout.setState({ payment: payment() });
    mocked.getPayment.mockResolvedValue(payment({ status: 'confirming' }));
    await useCheckout.getState().refresh();
    expect(useCheckout.getState().payment?.status).toBe('confirming');
  });
});
