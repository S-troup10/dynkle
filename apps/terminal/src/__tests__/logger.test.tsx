import { render, screen } from '@testing-library/react-native';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { log } from '@/lib/logger';

beforeEach(() => log.clear());

describe('logger', () => {
  it('keeps the most recent 300 entries', () => {
    for (let i = 0; i < 310; i++) log.info(`event ${i}`);
    const entries = log.entries();
    expect(entries).toHaveLength(300);
    expect(entries[0].message).toBe('event 10');
  });

  it('turns errors into messages and drops undefined context', () => {
    log.warn('Request failed', { error: new Error('boom'), path: '/payments', missing: undefined });
    expect(log.entries()[0].context).toEqual({ error: 'boom', path: '/payments' });
  });
});

describe('ErrorBoundary', () => {
  it('shows a restart screen and logs the crash', async () => {
    const Bomb = () => {
      throw new Error('kaboom');
    };
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
    spy.mockRestore();
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(log.entries().some((e) => e.level === 'error' && e.context?.error === 'kaboom')).toBe(true);
  });
});
