import { timingSafeEqual } from 'node:crypto';
import Fastify, { type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import type { z } from 'zod';
import {
  APP_VERSION_HEADER,
  IDEMPOTENCY_HEADER,
  addCategorySchema,
  addItemSchema,
  adminVerifySchema,
  createPaymentSchema,
  devConnectSchema,
  devDeclineSchema,
  devPairingClaimSchema,
  pairingClaimSchema,
  paymentMethodSchema,
  remoteChargeSchema,
  renameTillSchema,
  settingsPatchSchema,
  softwareUpdateSchema,
  solanaPayRequestSchema,
  updateCategorySchema,
  updateItemSchema,
  uploadLogsSchema,
  type PaymentMethod,
  type ServerEvent,
} from '@dynkle/shared';
import { HttpError, Store, type StoreOptions } from './store';
import { devPanelHtml } from './devPanel';
import { merchant } from './seed';

export interface ServerOptions extends StoreOptions {
  /** true for JSON logs at "info", or a level name. */
  logger?: boolean | 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  /** How often live connections get a heartbeat (and dead ones are dropped). */
  heartbeatMs?: number;
  /** Overrides the base URL used in Solana Pay links (defaults to the request host). */
  publicUrl?: string;
  /** When set, /dev and /dev/* (the dashboard + wallet simulator) need HTTP Basic auth with this password. */
  devPassword?: string;
}

/** Never log device tokens: the WebSocket carries one in its query string. */
export function redactUrl(url: string): string {
  return url.replace(/([?&]token=)[^&]*/g, '$1[redacted]');
}

/** Validates a request body against its schema; a bad body is a 400 naming the first problem. */
function parse<S extends z.ZodType>(schema: S, body: unknown): z.output<S> {
  const result = schema.safeParse(body ?? {});
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  throw new HttpError(400, `${issue.path.join('.') || 'body'}: ${issue.message}`);
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function buildServer(opts: ServerOptions = {}) {
  const store = new Store(opts);
  const logger =
    opts.logger === undefined || opts.logger === false
      ? false
      : {
          level: opts.logger === true ? 'info' : opts.logger,
          serializers: {
            req: (req: { method: string; url: string; id: string }) => ({ id: req.id, method: req.method, url: redactUrl(req.url) }),
          },
        };
  // trustProxy: behind Render/other proxies, build links from X-Forwarded-Proto/Host so they come out as https.
  const app = Fastify({ logger, trustProxy: true });
  await app.register(cors, { origin: true, methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'] });
  await app.register(websocket);

  const heartbeats = new Set<NodeJS.Timeout>();
  app.addHook('onClose', async () => {
    for (const t of heartbeats) clearInterval(t);
    store.dispose();
  });

  app.setErrorHandler((err: Error & { statusCode?: number }, req, reply) => {
    const status = err instanceof HttpError ? err.statusCode : (err.statusCode ?? 500);
    if (status >= 500) req.log.error({ err }, 'request failed');
    reply.status(status).send({ error: status >= 500 ? 'Something went wrong on the dashboard' : err.message });
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
      if (given.includes(':') && safeEqual(given.slice(given.indexOf(':') + 1), expected)) return;
      reply.header('WWW-Authenticate', 'Basic realm="Dynkle dev"').code(401).send({ error: 'Dev panel password required' });
    });
  }
  const bearer = (req: FastifyRequest) => {
    const h = req.headers.authorization;
    return h?.startsWith('Bearer ') ? h.slice(7) : undefined;
  };
  const header = (req: FastifyRequest, name: string) => {
    const v = req.headers[name];
    return typeof v === 'string' && v ? v.slice(0, 64) : undefined;
  };
  const device = (req: FastifyRequest) => store.deviceFor(bearer(req), header(req, APP_VERSION_HEADER));
  type Params<T> = FastifyRequest<{ Params: T }>;

  app.get('/health', async () => ({ ok: true }));

  // ---------- Pairing (terminal side) ----------
  app.post('/pairing/codes', async () => store.createPairingCode());
  app.get('/pairing/codes/:code', async (req: Params<{ code: string }>) => store.getPairingCode(req.params.code));

  // ---------- Pairing (dashboard side) ----------
  app.post('/pairing/claim', async (req) => {
    const body = parse(pairingClaimSchema, req.body);
    const { till } = store.claimPairingCode(body.code, body.tillName);
    return { till };
  });

  // ---------- Terminal ----------
  app.get('/terminal/me', async (req) => store.profile(device(req)));
  app.post('/terminal/unpair', async (req) => {
    store.unpair(device(req).till.id);
    return { ok: true };
  });
  app.post('/admin/verify', async (req) => {
    device(req);
    return { ok: store.verifyAdminCode(parse(adminVerifySchema, req.body).pin) };
  });
  // The terminal's own log buffer ("Send logs to support"). Written to the server log, tagged with the till.
  app.post('/terminal/logs', async (req) => {
    const { till } = device(req);
    const { entries } = parse(uploadLogsSchema, req.body);
    const log = req.log.child({ source: 'terminal', tillId: till.id, till: till.name });
    for (const e of entries) log[e.level]({ at: e.at, ...e.context }, e.message);
    return { ok: true, received: entries.length };
  });

  // ---------- Catalog ----------
  app.get('/catalog', async (req) => {
    device(req);
    return store.catalog;
  });
  app.post('/catalog/categories', async (req) => {
    device(req);
    return store.addCategory(parse(addCategorySchema, req.body));
  });
  app.patch('/catalog/categories/:id', async (req: Params<{ id: string }>) => {
    device(req);
    return store.updateCategory(req.params.id, parse(updateCategorySchema, req.body));
  });
  app.delete('/catalog/categories/:id', async (req: Params<{ id: string }>) => {
    device(req);
    store.deleteCategory(req.params.id);
    return { ok: true };
  });
  app.post('/catalog/items', async (req) => {
    device(req);
    return store.addItem(parse(addItemSchema, req.body));
  });
  app.patch('/catalog/items/:id', async (req: Params<{ id: string }>) => {
    device(req);
    return store.updateItem(req.params.id, parse(updateItemSchema, req.body));
  });
  app.delete('/catalog/items/:id', async (req: Params<{ id: string }>) => {
    device(req);
    store.deleteItem(req.params.id);
    return { ok: true };
  });

  // ---------- Payments ----------
  app.post('/payments', async (req) => {
    const { till } = device(req);
    return store.createPayment(till.id, parse(createPaymentSchema, req.body), baseUrl(req), 'terminal', header(req, IDEMPOTENCY_HEADER));
  });
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
    return { label: merchant.name, icon: `${baseUrl(req)}/icon.svg`, amountCents: p.totalCents, feeCents: p.customerFeeCents };
  });
  app.post('/solana-pay/:id', async (req: FastifyRequest<{ Params: { id: string }; Querystring: { wallet?: string } }>) => {
    const { account } = parse(solanaPayRequestSchema, req.body);
    const wallet = paymentMethodSchema.shape.wallet.catch('Phantom').parse(req.query.wallet) as PaymentMethod['wallet'];
    const short = account.length > 8 ? `${account.slice(0, 4)}…${account.slice(-4)}` : undefined;
    store.connectWallet(req.params.id, { wallet, channel: 'qr' }, short);
    return {
      transaction: Buffer.from(`mock-tx:${req.params.id}:${account}`).toString('base64'),
      message: `Thanks for paying at ${merchant.name}`,
    };
  });
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

    // Heartbeat: a JSON frame the terminal watches for, plus a protocol ping. A socket that
    // misses a pong is half-open (e.g. a proxy dropped it) and gets cut so its listener is freed.
    let alive = true;
    socket.on('pong', () => {
      alive = true;
    });
    const beat = setInterval(() => {
      if (!alive) {
        socket.terminate();
        return;
      }
      alive = false;
      socket.ping();
      socket.send(JSON.stringify({ type: 'heartbeat', at: new Date().toISOString() } satisfies ServerEvent));
    }, opts.heartbeatMs ?? 20_000);
    heartbeats.add(beat);

    socket.on('close', () => {
      clearInterval(beat);
      heartbeats.delete(beat);
      store.events.off('event', listener);
    });
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
  app.post('/dev/pairing/claim', async (req) => {
    const body = parse(devPairingClaimSchema, req.body);
    const code = body.code ?? [...store.pairingCodes.values()].filter((c) => c.status === 'waiting').at(-1)?.code;
    if (!code) throw new HttpError(404, 'No pairing code is waiting');
    return store.claimPairingCode(code, body.tillName);
  });
  app.post('/dev/payments/:id/connect', async (req: Params<{ id: string }>) => {
    const body = parse(devConnectSchema, req.body);
    return store.connectWallet(req.params.id, { wallet: body.wallet ?? 'DYNK app', channel: body.channel ?? 'tap' });
  });
  app.post('/dev/payments/:id/approve', async (req: Params<{ id: string }>) => store.approve(req.params.id));
  app.post('/dev/payments/:id/decline', async (req: Params<{ id: string }>) =>
    store.decline(req.params.id, parse(devDeclineSchema, req.body).reason),
  );
  app.post('/dev/payments/:id/expire', async (req: Params<{ id: string }>) => store.expire(req.params.id));
  app.post('/dev/remote-charge', async (req) => store.sendRemoteCharge(parse(remoteChargeSchema, req.body)));
  app.post('/dev/tills/:id/unpair', async (req: Params<{ id: string }>) => {
    store.unpair(req.params.id);
    return { ok: true };
  });
  app.post('/dev/tills/:id/rename', async (req: Params<{ id: string }>) => {
    store.renameTill(req.params.id, parse(renameTillSchema, req.body).name);
    return { ok: true };
  });
  app.post('/dev/settings', async (req) => {
    store.updateSettings(parse(settingsPatchSchema, req.body));
    return store.settings;
  });
  app.post('/dev/software-update', async (req) => {
    store.softwareUpdate(parse(softwareUpdateSchema, req.body).version ?? '1.0.1');
    return { ok: true };
  });
  app.post('/dev/catalog/items', async (req) => store.addItem(parse(addItemSchema, req.body)));

  return { app, store };
}
