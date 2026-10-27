import Fastify, { type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import type { CreatePaymentRequest, PaymentMethod, ServerEvent } from '@dynkle/shared';
import { HttpError, Store, type StoreOptions } from './store';
import { devPanelHtml } from './devPanel';

export interface ServerOptions extends StoreOptions {
  logger?: boolean;
  /** Overrides the base URL used in Solana Pay links (defaults to the request host). */
  publicUrl?: string;
  /** When set, /dev and /dev/* (the dashboard + wallet simulator) need HTTP Basic auth with this password. */
  devPassword?: string;
}

export async function buildServer(opts: ServerOptions = {}) {
  const store = new Store(opts);
  // trustProxy: behind Render/other proxies, build links from X-Forwarded-Proto/Host so they come out as https.
  const app = Fastify({ logger: opts.logger ?? false, trustProxy: true });
  await app.register(cors, { origin: true, methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'] });
  await app.register(websocket);

  app.addHook('onClose', async () => store.dispose());

  app.setErrorHandler((err: Error & { statusCode?: number }, _req, reply) => {
    const status = err instanceof HttpError ? err.statusCode : (err.statusCode ?? 500);
    reply.status(status).send({ error: err.message });
  });

  const baseUrl = (req: FastifyRequest) => opts.publicUrl ?? `${req.protocol}://${req.host}`;

  if (opts.devPassword) {
    const expected = opts.devPassword;
    app.addHook('onRequest', async (req, reply) => {
      const path = req.url.split('?')[0];
      if (path !== '/dev' && !path.startsWith('/dev/')) return;
      const header = req.headers.authorization ?? '';
      const given = header.startsWith('Basic ') ? Buffer.from(header.slice(6), 'base64').toString() : '';
      // Any username; only the password is checked.
      if (given.slice(given.indexOf(':') + 1) === expected && given.includes(':')) return;
      reply.header('WWW-Authenticate', 'Basic realm="Dynkle dev"').code(401).send({ error: 'Dev panel password required' });
    });
  }
  const bearer = (req: FastifyRequest) => {
    const h = req.headers.authorization;
    return h?.startsWith('Bearer ') ? h.slice(7) : undefined;
  };
  const device = (req: FastifyRequest) => store.deviceFor(bearer(req));
  type Body<T> = FastifyRequest<{ Body: T }>;
  type Params<T> = FastifyRequest<{ Params: T }>;

  app.get('/health', async () => ({ ok: true }));

  // ---------- Pairing (terminal side) ----------
  app.post('/pairing/codes', async () => store.createPairingCode());
  app.get('/pairing/codes/:code', async (req: Params<{ code: string }>) => store.getPairingCode(req.params.code));

  // ---------- Pairing (dashboard side) ----------
  app.post('/pairing/claim', async (req: Body<{ code: string; tillName?: string }>) => {
    const { till } = store.claimPairingCode(req.body.code, req.body.tillName);
    return { till };
  });

  // ---------- Terminal ----------
  app.get('/terminal/me', async (req) => store.profile(device(req).till));
  app.post('/terminal/unpair', async (req) => {
    store.unpair(device(req).till.id);
    return { ok: true };
  });
  app.post('/admin/verify', async (req: Body<{ pin: string }>) => {
    device(req);
    return { ok: store.verifyAdminCode(String(req.body?.pin ?? '')) };
  });

  // ---------- Catalog ----------
  app.get('/catalog', async (req) => {
    device(req);
    return store.catalog;
  });
  app.post('/catalog/categories', async (req: Body<{ name: string; parentId?: string | null }>) => {
    device(req);
    return store.addCategory(req.body);
  });
  app.patch('/catalog/categories/:id', async (req: FastifyRequest<{ Params: { id: string }; Body: { name?: string; sort?: number } }>) => {
    device(req);
    return store.updateCategory(req.params.id, req.body);
  });
  app.delete('/catalog/categories/:id', async (req: Params<{ id: string }>) => {
    device(req);
    store.deleteCategory(req.params.id);
    return { ok: true };
  });
  app.post('/catalog/items', async (req: Body<Parameters<Store['addItem']>[0]>) => {
    device(req);
    return store.addItem(req.body);
  });
  app.patch('/catalog/items/:id', async (req: FastifyRequest<{ Params: { id: string }; Body: Parameters<Store['updateItem']>[1] }>) => {
    device(req);
    return store.updateItem(req.params.id, req.body);
  });
  app.delete('/catalog/items/:id', async (req: Params<{ id: string }>) => {
    device(req);
    store.deleteItem(req.params.id);
    return { ok: true };
  });

  // ---------- Payments ----------
  app.post('/payments', async (req: Body<CreatePaymentRequest>) =>
    store.createPayment(device(req).till.id, req.body, baseUrl(req)),
  );
  app.get('/payments/:id', async (req: Params<{ id: string }>) => {
    const p = store.getPayment(req.params.id);
    if (p.tillId !== device(req).till.id) throw new HttpError(404, 'Unknown payment');
    return p;
  });
  app.post('/payments/:id/cancel', async (req: Params<{ id: string }>) => {
    const p = store.getPayment(req.params.id);
    if (p.tillId !== device(req).till.id) throw new HttpError(404, 'Unknown payment');
    return store.cancelPayment(p.id);
  });
  app.get('/transactions', async (req) => store.transactions(device(req).till.id));

  app.post('/remote-charges/:id/accept', async (req: Params<{ id: string }>) =>
    store.acceptRemoteCharge(req.params.id, device(req).till.id, baseUrl(req)),
  );
  app.post('/remote-charges/:id/dismiss', async (req: Params<{ id: string }>) => {
    store.dismissRemoteCharge(req.params.id, device(req).till.id);
    return { ok: true };
  });

  // ---------- Solana Pay transaction request (stub) ----------
  app.get('/solana-pay/:id', async (req: Params<{ id: string }>) => {
    const p = store.getPayment(req.params.id);
    return { label: 'Dynkle Café', icon: `${baseUrl(req)}/icon.svg`, amountCents: p.totalCents };
  });
  app.post(
    '/solana-pay/:id',
    async (req: FastifyRequest<{ Params: { id: string }; Body: { account: string }; Querystring: { wallet?: string } }>) => {
      const account = req.body?.account ?? '';
      const wallet = (req.query.wallet as PaymentMethod['wallet']) ?? 'Phantom';
      const short = account.length > 8 ? `${account.slice(0, 4)}…${account.slice(-4)}` : undefined;
      store.connectWallet(req.params.id, { wallet, channel: 'qr' }, short);
      return {
        transaction: Buffer.from(`mock-tx:${req.params.id}:${account}`).toString('base64'),
        message: 'Thanks for paying at Dynkle Café',
      };
    },
  );
  app.get('/icon.svg', async (_req, reply) =>
    reply
      .type('image/svg+xml')
      .send('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#FF8000"/></svg>'),
  );

  // ---------- Live events ----------
  app.get('/ws', { websocket: true }, (socket, req: FastifyRequest<{ Querystring: { token?: string } }>) => {
    let tillId: string;
    try {
      tillId = store.deviceFor(req.query.token).till.id;
    } catch {
      socket.send(JSON.stringify({ type: 'terminal.unpaired' } satisfies ServerEvent));
      socket.close(4401, 'Not paired');
      return;
    }
    const listener = ({ tillId: target, event }: { tillId: string | null; event: ServerEvent }) => {
      if (target === null || target === tillId) socket.send(JSON.stringify(event));
      if (event.type === 'terminal.unpaired' && target === tillId) socket.close(4401, 'Unpaired');
    };
    store.events.on('event', listener);
    socket.on('close', () => store.events.off('event', listener));
    for (const charge of store.pendingRemoteCharges(tillId)) {
      socket.send(JSON.stringify({ type: 'remote_charge', charge } satisfies ServerEvent));
    }
  });

  // ---------- Dev panel: stands in for the merchant dashboard and the customer's wallet ----------
  app.get('/', async (_req, reply) => reply.redirect('/dev'));
  app.get('/dev', async (_req, reply) => reply.type('text/html').send(devPanelHtml));
  app.get('/dev/state', async () => ({
    tills: store.tills(),
    settings: store.settings,
    pairingCodes: [...store.pairingCodes.values()].filter((c) => c.status === 'waiting').map((c) => store.getPairingCode(c.code)),
    payments: [...store.payments.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 15),
    catalog: store.catalog,
  }));
  app.post('/dev/pairing/claim', async (req: Body<{ code?: string; tillName?: string }>) => {
    const code = req.body?.code ?? [...store.pairingCodes.values()].filter((c) => c.status === 'waiting').at(-1)?.code;
    if (!code) throw new HttpError(404, 'No pairing code is waiting');
    return store.claimPairingCode(code, req.body?.tillName);
  });
  app.post('/dev/payments/:id/connect', async (req: FastifyRequest<{ Params: { id: string }; Body: Partial<PaymentMethod> }>) =>
    store.connectWallet(req.params.id, { wallet: req.body?.wallet ?? 'DYNK app', channel: req.body?.channel ?? 'tap' }),
  );
  app.post('/dev/payments/:id/approve', async (req: Params<{ id: string }>) => store.approve(req.params.id));
  app.post('/dev/payments/:id/decline', async (req: FastifyRequest<{ Params: { id: string }; Body: { reason?: string } }>) =>
    store.decline(req.params.id, req.body?.reason),
  );
  app.post('/dev/payments/:id/expire', async (req: Params<{ id: string }>) => store.expire(req.params.id));
  app.post('/dev/remote-charge', async (req: Body<Parameters<Store['sendRemoteCharge']>[0]>) => store.sendRemoteCharge(req.body));
  app.post('/dev/tills/:id/unpair', async (req: Params<{ id: string }>) => {
    store.unpair(req.params.id);
    return { ok: true };
  });
  app.post('/dev/tills/:id/rename', async (req: FastifyRequest<{ Params: { id: string }; Body: { name: string } }>) => {
    store.renameTill(req.params.id, req.body.name);
    return { ok: true };
  });
  app.post('/dev/settings', async (req: Body<Partial<typeof store.settings>>) => {
    store.updateSettings(req.body);
    return store.settings;
  });
  app.post('/dev/software-update', async (req: Body<{ version?: string }>) => {
    store.softwareUpdate(req.body?.version ?? '1.0.1');
    return { ok: true };
  });
  app.post('/dev/catalog/items', async (req: Body<Parameters<Store['addItem']>[0]>) => store.addItem(req.body));

  return { app, store };
}
