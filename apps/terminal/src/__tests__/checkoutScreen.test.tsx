import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import Checkout from '@/app/(main)/checkout/index';
import { playSound } from '@/lib/sound';
import { useCheckout } from '@/state/checkout';
import { useSession } from '@/state/session';
import { payment, profile } from '@/__fixtures__/payments';

jest.mock('@/lib/sound', () => ({ playSound: jest.fn() }));

const show = (p: ReturnType<typeof payment>) =>
  useCheckout.setState({ payment: p, draft: { lines: [], subtotalCents: p.subtotalCents, source: 'terminal' }, tipCents: p.tipCents });

beforeEach(() => {
  // Countdowns tick on timers; keep them from firing outside act().
  jest.useFakeTimers();
  useSession.setState({ phase: 'paired', token: 't', profile });
});
afterEach(() => {
  jest.useRealTimers();
  useCheckout.setState({ payment: null, draft: null, busy: false });
});

describe('checkout screen', () => {
  it('shows the armed charge with its QR code and price lock', async () => {
    show(payment());
    await render(<Checkout />);
    expect(screen.getByTestId('armed-amount')).toHaveTextContent('$24.15');
    expect(screen.getByText('Includes $3.15 tip')).toBeTruthy();
    expect(screen.getByLabelText(/Payment QR code/)).toBeTruthy();
    expect(screen.getByLabelText(/Price locked for \d+ more seconds/)).toBeTruthy();
  });

  it('moves through confirming and processing as the status changes', async () => {
    show(payment({ status: 'wallet_connected', method: { wallet: 'Phantom', channel: 'qr' } }));
    await render(<Checkout />);
    expect(screen.getByText('Phantom connected by QR')).toBeTruthy();
    await act(async () => useCheckout.getState().onStatus(payment({ status: 'confirming' })));
    expect(screen.getByText('Confirming payment')).toBeTruthy();
  });

  it('chimes and announces a paid sale', async () => {
    show(payment({ status: 'paid', method: { wallet: 'DYNK app', channel: 'tap' } }));
    await render(<Checkout />);
    expect(screen.getByTestId('paid-title')).toHaveTextContent('Paid');
    expect(playSound).toHaveBeenCalledWith('paid');
  });

  it('shows why a payment failed and lets the merchant retry', async () => {
    const rearm = jest.fn(async () => null);
    useCheckout.setState({ rearm });
    show(payment({ status: 'failed', failureReason: 'The customer declined in their wallet.' }));
    await render(<Checkout />);
    expect(screen.getByText('The customer declined in their wallet.')).toBeTruthy();
    expect(playSound).toHaveBeenCalledWith('failed');
    await fireEvent.press(screen.getByTestId('try-again'));
    expect(rearm).toHaveBeenCalled();
  });

  it('offers to re-arm an expired charge', async () => {
    show(payment({ status: 'expired' }));
    await render(<Checkout />);
    expect(screen.getByText('Price lock expired')).toBeTruthy();
    expect(screen.getByTestId('rearm')).toHaveTextContent('Re-arm $24.15');
  });

  it('goes back to selling when the charge is cancelled', async () => {
    show(payment({ status: 'cancelled' }));
    await render(<Checkout />);
    expect(router.dismissTo).toHaveBeenCalledWith('/keypad');
  });
});
