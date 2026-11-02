import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import type { PaymentSession, ServerEvent, TerminalProfile, TransactionsResponse } from '@dynkle/shared';
import { buildServer, redactUrl, type ServerOptions } from './server';

type Built = Awaited<ReturnType<typeof buildServer>>;

let dir: string;
let built: Built | null = null;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dynkle-'));
});
afterEach(async () => {
  vi.useRealTimers();
  await built?.app.close();
  built = null;
  rmSync(dir, { recursive: true, force: true });
});

async function start(opts: ServerOptions = {}) {
  await built?.app.close();
  built = await buildServer({ confirmDelayMs: 30, seedActivity: false, ...opts });
  return built;
}

async function call<T = unknown>(method: string, url: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await built!.app.inject({ method: method as 'GET', url, payload: body as object, headers });
  return { status: res.statusCode, json: res.json() as T };
}

async function pair(): Promise<string> {
  const { code } = (await call<{ code: string }>('POST', '/pairing/codes')).json;
  await call('POST', '/pairing/claim', { code, tillName: 'Front' });
  return (await call<{ token: string }>('GET', `/pairing/codes/${code}`)).json.token;
}

const auth = (token: string, extra: Record<string, string> = {}) => ({ authorization: `Bearer ${token}`, ...extra });

describe('surviving a restart', () => {
  it('keeps terminals paired across a restart when tokens are signed, even with nothing saved', async () => {
    await start({ tokenSecret: 's3cret' });
    const token = await pair();
    await start({ tokenSecret: 's3cret' });
    const me = await call<TerminalProfile>('GET', '/terminal/me', undefined, auth(token));
    expect(me.status).toBe(200);
    expect(me.json.till.name).toBe('Front');
  });

  it('rejects a token signed with another secret or tampered with', async () => {
    await start({ tokenSecret: 's3cret' });
    const token = await pair();
    await start({ tokenSecret: 'other' });
    expect((await call('GET', '/terminal/me', undefined, auth(token))).status).toBe(401);
    await start({ tokenSecret: 's3cret' });
    const [payload, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ t: 'till_x', n: 'Evil', r: '1' })).toString('base64url');
    expect((await call('GET', '/terminal/me', undefined, auth(`${forged}.${sig}`))).status).toBe(401);
    expect((await call('GET', '/terminal/me', undefined, auth(`${payload}.${sig}`))).status).toBe(200);
  });

  it('saves to and reloads from the data file', async () => {
    const dataFile = join(dir, 'store.json');
    const b = await start({ dataFile, tokenSecret: 's' });
    const token = await pair();
    await call('POST', '/catalog/categories', { name: 'Specials' }, auth(token));
    const p = (await call<PaymentSession>('POST', '/payments', { subtotalCents: 500 }, auth(token))).json;
    await call('POST', `/dev/payments/${p.id}/approve`);
    await new Promise((r) => setTimeout(r, 80));
    await b.app.close();
    built = null;

    await start({ dataFile, tokenSecret: 's' });
    const catalog = await call<{ categories: { name: string }[] }>('GET', '/catalog', undefined, auth(token));
    expect(catalog.json.categories.some((c) => c.name === 'Specials')).toBe(true);
    const tx = await call<TransactionsResponse>('GET', '/transactions', undefined, auth(token));
    expect(tx.json.paidCount).toBe(1);
  });

  it('does not bring back a till the dashboard unpaired', async () => {
    const dataFile = join(dir, 'store.json');
    await start({ dataFile, tokenSecret: 's' });
    const token = await pair();
    const me = (await call<TerminalProfile>('GET', '/terminal/me', undefined, auth(token))).json;
    await call('POST', `/dev/tills/${me.till.id}/unpair`);
    built!.store.flush();
    await start({ dataFile, tokenSecret: 's' });
    expect((await call('GET', '/terminal/me', undefined, auth(token))).status).toBe(401);
  });

  it('re-arms the expiry of a charge that was live when the server stopped', async () => {
    const dataFile = join(dir, 'store.json');
    await start({ dataFile, tokenSecret: 's' });
    const token = await pair();
    await call('POST', '/dev/settings', { priceLockSeconds: 0.05 });
    const p = (await call<PaymentSession>('POST', '/payments', { subtotalCents: 500 }, auth(token))).json;
    built!.store.flush();
    await start({ dataFile, tokenSecret: 's' });
    expect((await call<PaymentSession>('GET', `/payments/${p.id}`, undefined, auth(token))).json.status).toBe('armed');
    await new Promise((r) => setTimeout(r, 100));
    expect((await call<PaymentSession>('GET', `/payments/${p.id}`, undefined, auth(token))).json.status).toBe('expired');
  });
});

describe('idempotent payments', () => {
  it('returns the same payment for a retried request', async () => {
    await start();
    const token = await pair();
    const body = { subtotalCents: 1200, tipCents: 0 };
    const a = await call<PaymentSession>('POST', '/payments', body, auth(token, { 'idempotency-key': 'k1' }));
    const b = await call<PaymentSession>('POST', '/payments', body, auth(token, { 'idempotency-key': 'k1' }));
    expect(b.json.id).toBe(a.json.id);
    expect(b.json.status).toBe('armed');
    const c = await call<PaymentSession>('POST', '/payments', body, auth(token, { 'idempotency-key': 'k2' }));
    expect(c.json.id).not.toBe(a.json.id);
  });
});

describe("today's activity", () => {
  it("counts the merchant's day (Melbourne), not the server's", async () => {
    // 9:30am in Melbourne on 2 Nov (22:30 UTC on 1 Nov): yesterday in UTC, today in Melbourne.
    vi.useFakeTimers({ now: Date.UTC(2026, 10, 1, 22, 30), toFake: ['Date'] });
    await start();
    const token = await pair();
    const p = (await call<PaymentSession>('POST', '/payments', { subtotalCents: 700 }, auth(token))).json;
    await call('POST', `/dev/payments/${p.id}/expire`);
    // A sale at 11:30pm Melbourne time the day before must not count.
    const stale = { ...built!.store.getPayment(p.id), id: 'pay_old', createdAt: new Date(Date.UTC(2026, 10, 1, 12, 30)).toISOString() };
    built!.store.payments.set(stale.id, stale);
    const tx = (await call<TransactionsResponse>('GET', '/transactions', undefined, auth(token))).json;
    expect(tx.transactions.map((t) => t.id)).toEqual([p.id]);
  });
});

describe('request validation', () => {
  it('rejects malformed bodies with a 400 naming the field', async () => {
    await start();
    const token = await pair();
    const bad = await call<{ error: string }>('POST', '/payments', { subtotalCents: 'lots' }, auth(token));
    expect(bad.status).toBe(400);
    expect(bad.json.error).toMatch(/^subtotalCents:/);
    const badItem = await call<{ error: string }>('POST', '/catalog/items', { categoryId: 'cat_coffee', name: 'X', variants: [{ priceCents: '1' }] }, auth(token));
    expect(badItem.status).toBe(400);
    expect(badItem.json.error).toMatch(/^variants\.0\.priceCents:/);
    expect((await call('POST', '/pairing/claim', {})).status).toBe(400);
  });
});

describe('terminal reporting', () => {
  it('reports the app version the terminal sends', async () => {
    await start();
    const token = await pair();
    const me = await call<TerminalProfile>('GET', '/terminal/me', undefined, auth(token, { 'x-dynkle-app-version': '1.2.3' }));
    expect(me.json.appVersion).toBe('1.2.3');
  });

  it('accepts uploaded terminal logs', async () => {
    await start();
    const token = await pair();
    const entries = [{ at: new Date().toISOString(), level: 'warn', message: 'WebSocket dropped', context: { attempt: 2 } }];
    const res = await call<{ received: number }>('POST', '/terminal/logs', { entries }, auth(token));
    expect(res.json.received).toBe(1);
  });

  it('keeps device tokens out of logged URLs', () => {
    expect(redactUrl('/ws?token=abc.def&x=1')).toBe('/ws?token=[redacted]&x=1');
  });
});

describe('heartbeat', () => {
  it('sends heartbeats on the live connection', async () => {
    await start({ heartbeatMs: 20 });
    const token = await pair();
    await built!.app.listen({ port: 0, host: '127.0.0.1' });
    const { port } = built!.app.server.address() as { port: number };
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${token}`);
    const event = await new Promise<ServerEvent>((r) => ws.once('message', (m) => r(JSON.parse(String(m)))));
    expect(event.type).toBe('heartbeat');
    ws.close();
  });
});

describe('pruning', () => {
  it('drops old completed payments and stale pairing codes', async () => {
    const { store } = await start();
    await pair();
    const tillId = store.tills()[0].id;
    const p = store.createPayment(tillId, { lines: [], subtotalCents: 100, tipCents: 0 }, 'http://x');
    store.cancelPayment(p.id);
    const later = Date.now() + 31 * 24 * 3_600_000;
    store.prune(later);
    expect(store.payments.has(p.id)).toBe(false);
    expect(store.pairingCodes.size).toBe(0);
  });
});
