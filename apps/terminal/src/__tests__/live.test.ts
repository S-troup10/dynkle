import { QueryClient } from '@tanstack/react-query';
import { startLiveConnection } from '@/api/live';
import { useCheckout } from '@/state/checkout';
import { useSession } from '@/state/session';
import { useUi } from '@/state/ui';
import { payment } from '@/__fixtures__/payments';

class FakeSocket {
  static all: FakeSocket[] = [];
  static readonly OPEN = 1;
  readyState = FakeSocket.OPEN;
  onopen: (() => void) | null = null;
  onmessage: ((m: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  sent: unknown[] = [];
  constructor(public url: string) {
    FakeSocket.all.push(this);
  }
  close() {
    this.closed = true;
  }
  open() {
    this.onopen?.();
  }
  /** The code under test sending a frame out (HELLO, HEARTBEAT, ACK…). */
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  /** The server pushing a frame in, for the test to simulate. */
  emit(event: object) {
    this.onmessage?.({ data: JSON.stringify(event) });
  }
}

const latest = () => FakeSocket.all[FakeSocket.all.length - 1];
let stop: () => void;

beforeEach(() => {
  jest.useFakeTimers();
  FakeSocket.all = [];
  (globalThis as unknown as { WebSocket: unknown }).WebSocket = FakeSocket;
  useSession.setState({ phase: 'paired', token: 'tok', apiUrl: 'https://dash' });
});
afterEach(() => {
  stop?.();
  jest.useRealTimers();
});

describe('live connection', () => {
  it('connects with the token, sends HELLO, and routes order-status updates into checkout', () => {
    stop = startLiveConnection(new QueryClient(), { watchDevice: false });
    expect(latest().url).toBe('wss://dash/ws/terminal?token=tok');
    latest().open();
    expect(useUi.getState().socket).toBe('open');
    expect(latest().sent[0]).toMatchObject({ type: 'HELLO' });
    const current = payment({ id: 'ord_1', status: 'armed' });
    useCheckout.setState({ payment: current });
    latest().emit({
      v: 2,
      type: 'ORDER_STATUS',
      id: 'm1',
      payload: { orderId: 'ord_1', status: 'PROCESSING', totalCents: current.totalCents },
    });
    expect(useCheckout.getState().payment?.status).toBe('confirming');
    expect(latest().sent.some((m) => (m as { type: string }).type === 'ACK')).toBe(true);
  });

  it('treats a silent socket as dead and reconnects', () => {
    stop = startLiveConnection(new QueryClient(), { watchDevice: false, silenceTimeoutMs: 1000 });
    const first = latest();
    first.open();
    jest.advanceTimersByTime(800);
    first.emit({ v: 2, type: 'HEARTBEAT_ACK', id: 'h1' }); // keeps it alive
    jest.advanceTimersByTime(800);
    expect(first.closed).toBe(false);
    jest.advanceTimersByTime(300); // 1000ms since the last frame
    expect(first.closed).toBe(true);
    expect(useUi.getState().socket).toBe('closed');
    jest.advanceTimersByTime(600); // backoff
    expect(FakeSocket.all).toHaveLength(2);
  });

  it('re-checks the sale on screen after reconnecting', () => {
    const refresh = jest.fn(async () => undefined);
    useCheckout.setState({ refresh });
    stop = startLiveConnection(new QueryClient(), { watchDevice: false });
    latest().open();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('backs off between attempts, up to 10 seconds', () => {
    stop = startLiveConnection(new QueryClient(), { watchDevice: false });
    for (let i = 0; i < 8; i++) {
      latest().onclose?.();
      jest.advanceTimersByTime(10_000);
    }
    const count = FakeSocket.all.length;
    latest().onclose?.();
    jest.advanceTimersByTime(9_999);
    expect(FakeSocket.all).toHaveLength(count);
    jest.advanceTimersByTime(1);
    expect(FakeSocket.all).toHaveLength(count + 1);
  });
});
