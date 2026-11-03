import { api } from '@/api/client';
import { startTapToPay } from '@/lib/tapToPay';
import { ble } from '@/native/hardware';
import { shouldApply } from '@/state/checkoutLogic';
import { useUi } from '@/state/ui';
import { payment } from '@/__fixtures__/payments';

jest.mock('@/api/client', () => ({
  ...jest.requireActual('@/api/client'),
  api: { bleSession: jest.fn(), bleEvent: jest.fn(), claimSignature: jest.fn() },
}));
const mocked = api as jest.Mocked<typeof api>;

const session = (e = Date.now() + 60_000, n = 'nonce-1') => ({
  session: { v: 2 as const, n, e, d: 'Dynkle Café', a: { SOL: 'Merchant111' }, s: 'sig' },
  wire: JSON.stringify({ v: 2, n, e, d: 'Dynkle Café', a: { SOL: 'Merchant111' }, s: 'sig' }),
  minRemainingMs: 15_000,
});
const write = (device: string, body: object) => ble.simulate({ action: 'write', device, text: JSON.stringify(body) });
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

let stop: (() => void) | null = null;
beforeEach(() => {
  jest.useFakeTimers();
  mocked.bleSession.mockResolvedValue(session());
  mocked.bleEvent.mockResolvedValue(payment());
  mocked.claimSignature.mockResolvedValue(payment({ status: 'confirming' }));
});
afterEach(() => {
  stop?.();
  stop = null;
  jest.useRealTimers();
});

describe('Bluetooth Tap to Pay', () => {
  it('serves the session and reports what the phone does', async () => {
    stop = startTapToPay('pay_1');
    await flush();
    expect(useUi.getState().tapToPay).toBe('waiting');

    ble.simulate({ action: 'read', device: 'AA' });
    expect(mocked.bleEvent).toHaveBeenLastCalledWith('pay_1', 'read', 'AA', undefined);

    write('AA', { transferStatus: 'processing', amount: '1043.71', symbol: 'DYNK' });
    expect(mocked.bleEvent).toHaveBeenLastCalledWith(
      'pay_1',
      'processing',
      'AA',
      expect.objectContaining({ transferStatus: 'processing' }),
    );
    expect(useUi.getState().tapToPay).toBe('busy');

    write('AA', { transferStatus: 'confirmed', txSignature: '5h3kSig' });
    expect(mocked.claimSignature).toHaveBeenCalledWith('pay_1', '5h3kSig', 'AA');

    ble.simulate({ action: 'disconnect', device: 'AA' });
    expect(mocked.bleEvent).toHaveBeenLastCalledWith('pay_1', 'disconnected', 'AA', undefined);
  });

  it('serves one customer: a second phone is ignored once the first is paying', async () => {
    stop = startTapToPay('pay_1');
    await flush();
    write('AA', { transferStatus: 'processing' });
    mocked.bleEvent.mockClear();
    ble.simulate({ action: 'read', device: 'BB' });
    write('BB', { transferStatus: 'failed' });
    expect(mocked.bleEvent).not.toHaveBeenCalled();
  });

  it('reports a payment that failed in the app', async () => {
    stop = startTapToPay('pay_1');
    await flush();
    write('AA', { transferStatus: 'failed' });
    expect(mocked.bleEvent).toHaveBeenLastCalledWith('pay_1', 'failed', 'AA', expect.objectContaining({ transferStatus: 'failed' }));
  });

  it('ignores writes it cannot read (the dashboard watches the chain instead)', async () => {
    stop = startTapToPay('pay_1');
    await flush();
    ble.simulate({ action: 'write', device: 'AA', text: '{"transferStat' });
    write('AA', { transferStatus: 'confirmed' }); // no signature
    expect(mocked.bleEvent).not.toHaveBeenCalled();
    expect(mocked.claimSignature).not.toHaveBeenCalled();
  });

  it('rotates the session before it expires, and stops rotating once a phone is paying', async () => {
    mocked.bleSession.mockResolvedValueOnce(session(Date.now() + 60_000, 'n1')).mockResolvedValue(session(Date.now() + 105_000, 'n2'));
    const setSession = jest.spyOn(ble, 'setSession');
    stop = startTapToPay('pay_1');
    await flush();
    await jest.advanceTimersByTimeAsync(44_000);
    expect(setSession).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1_500); // 45s in: 15s left
    expect(setSession).toHaveBeenCalledWith(expect.stringContaining('"n":"n2"'));
    write('AA', { transferStatus: 'processing' });
    mocked.bleSession.mockClear();
    await jest.advanceTimersByTimeAsync(120_000);
    expect(mocked.bleSession).not.toHaveBeenCalled();
    setSession.mockRestore();
  });

  it('stops serving when the charge ends', async () => {
    const bleStop = jest.spyOn(ble, 'stop');
    stop = startTapToPay('pay_1');
    await flush();
    stop();
    stop = null;
    expect(bleStop).toHaveBeenCalled();
    expect(useUi.getState().tapToPay).toBe('off');
    ble.simulate({ action: 'read', device: 'AA' });
    expect(mocked.bleEvent).not.toHaveBeenCalled();
    bleStop.mockRestore();
  });

  it('shows Tap to Pay as unavailable when the dashboard has no session for it', async () => {
    mocked.bleSession.mockRejectedValue(Object.assign(new Error('Payment is paid'), { status: 409 }));
    stop = startTapToPay('pay_1');
    await flush();
    expect(useUi.getState().tapToPay).toBe('unavailable');
  });
});

describe('status updates from Bluetooth payments', () => {
  it('goes back to armed when the phone walks away, and always shows a payment that landed', () => {
    expect(shouldApply(payment({ status: 'wallet_connected' }), payment({ status: 'armed' }))).toBe(true);
    expect(shouldApply(payment({ status: 'approved' }), payment({ status: 'armed' }))).toBe(false);
    expect(shouldApply(payment({ status: 'expired' }), payment({ status: 'paid' }))).toBe(true);
    expect(shouldApply(payment({ status: 'expired' }), payment({ status: 'failed' }))).toBe(false);
  });
});
