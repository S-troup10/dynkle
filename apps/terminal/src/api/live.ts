import type { ServerEvent } from '@dynkle/shared';
import { QueryClient } from '@tanstack/react-query';
import { useSession } from '@/state/session';
import { useCheckout } from '@/state/checkout';
import { useUi } from '@/state/ui';

/**
 * One WebSocket per paired terminal. Reconnects with backoff and routes
 * dashboard events into the stores.
 */
export function startLiveConnection(queryClient: QueryClient): () => void {
  let ws: WebSocket | null = null;
  let stopped = false;
  let attempt = 0;
  let retry: ReturnType<typeof setTimeout> | null = null;

  const handle = (event: ServerEvent) => {
    switch (event.type) {
      case 'payment.status':
        useCheckout.getState().onStatus(event.payment);
        if (['paid', 'failed', 'expired'].includes(event.payment.status)) {
          queryClient.invalidateQueries({ queryKey: ['transactions'] });
        }
        break;
      case 'remote_charge':
        useCheckout.getState().receiveIncoming(event.charge);
        break;
      case 'catalog.updated':
        queryClient.setQueryData(['catalog'], event.catalog);
        break;
      case 'settings.updated':
        useSession.getState().setProfile(event.profile);
        break;
      case 'terminal.unpaired':
        useSession.getState().markUnpaired();
        break;
      case 'software_update':
        useUi.getState().setUpdate(event.version);
        break;
    }
  };

  const connect = () => {
    const { apiUrl, token } = useSession.getState();
    if (stopped || !token) return;
    useUi.getState().setSocket('connecting');
    ws = new WebSocket(`${apiUrl.replace(/^http/, 'ws')}/ws?token=${encodeURIComponent(token)}`);
    ws.onopen = () => {
      attempt = 0;
      useUi.getState().setSocket('open');
      // Catch up on anything missed while disconnected.
      queryClient.invalidateQueries();
    };
    ws.onmessage = (m) => {
      try {
        handle(JSON.parse(String(m.data)) as ServerEvent);
      } catch {
        // Ignore malformed frames.
      }
    };
    ws.onclose = () => {
      ws = null;
      if (stopped) return;
      useUi.getState().setSocket('closed');
      const delay = Math.min(10_000, 500 * 2 ** attempt++);
      retry = setTimeout(connect, delay);
    };
  };

  connect();
  return () => {
    stopped = true;
    if (retry) clearTimeout(retry);
    ws?.close();
    useUi.getState().setSocket('closed');
  };
}
