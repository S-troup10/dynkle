import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import type { PaymentSession, ServerEvent } from '@dynkle/shared';
import { buildServer } from './server';

type Built = Awaited<ReturnType<typeof buildServer>>;
let built: Built;
let token: string;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function req<T = unknown>(method: string, url: string, body?: unknown, auth = true): Promise<{ status: number; json: T }> {
  const res = await built.app.inject({
    method: method as 'GET',
    url,
    payload: body as object,
    headers: auth && token ? { authorization: `Bearer ${token}` } : {},
  });
  return { status: res.statusCode, json: res.json() as T };
}

async function pair() {
  const code = (await req<{ code: string }>('POST', '/pairing/codes', undefined, false)).json.code;
  await req('POST', '/pairing/claim', { code, tillName: 'Till 2' }, false);
  const polled = await req<{ status: string; token: string }>('GET', `/pairing/codes/${code}`, undefined, false);
  token = polled.json.token;
  return polled.json;
}

beforeEach(async () => {
  built = await buildServer({ confirmDelayMs: 30, seedActivity: false });
  token = '';
});
afterEach(async () => {
  await built.app.close();
});

describe('pairing', () => {
  it('issues a code, lets the dashboard claim it and hands the terminal a token', async () => {
    const created = await req<{ code: string; status: string }>('POST', '/pairing/codes', undefined, false);
    expect(created.json.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(created.json.status).toBe('waiting');

    const p = await pair();
    expect(p.status).toBe('claimed');
    const me = await req<{ till: { name: string }; merchant: { name: string } }>('GET', '/terminal/me');
    expect(me.json.till.name).toBe('Till 2');
    expect(me.json.merchant.name).toBe('Dynkle Café');
  });

  it('rejects unpaired terminals', async () => {
    expect((await req('GET', '/terminal/me', undefined, false)).status).toBe(401);
  });

  it('expires codes', async () => {
    await built.app.close();
    built = await buildServer({ pairingTtlMs: 1, seedActivity: false });
    const code = (await req<{ code: string }>('POST', '/pairing/codes', undefined, false)).json.code;
    await wait(5);
    expect((await req<{ status: string }>('GET', `/pairing/codes/${code}`, undefined, false)).json.status).toBe('expired');
    expect((await req('POST', '/pairing/claim', { code }, false)).status).toBe(409);
  });

  it('unpairs', async () => {
    await pair();
    expect((await req('POST', '/terminal/unpair')).status).toBe(200);
    expect((await req('GET', '/terminal/me')).status).toBe(401);
  });
});

describe('payments', () => {
  beforeEach(pair);

  const create = async (subtotalCents = 2100, tipCents = 315) =>
    (await req<PaymentSession>('POST', '/payments', { lines: [], subtotalCents, tipCents })).json;

  it('creates an armed session with GST and Solana Pay links', async () => {
    const p = await create();
    expect(p.status).toBe('armed');
    expect(p.totalCents).toBe(2415);
    expect(p.gstCents).toBe(191);
    expect(p.solanaPayUrl.startsWith('solana:http')).toBe(true);
    expect(p.qrUrl).toContain('https://pay.dynk.io/p/' + p.id);
    expect(decodeURIComponent(new URL(p.qrUrl).searchParams.get('r')!)).toContain(`/solana-pay/${p.id}`);
    expect(p.ndefUrl).toBe(p.qrUrl);
  });

  it('rejects zero amounts', async () => {
    expect((await req('POST', '/payments', { lines: [], subtotalCents: 0, tipCents: 0 })).status).toBe(400);
  });

  it('walks connect -> approve -> confirming -> paid', async () => {
    const p = await create();
    await req('POST', `/dev/payments/${p.id}/connect`, { wallet: 'DYNK app', channel: 'tap' });
    expect((await req<PaymentSession>('GET', `/payments/${p.id}`)).json.status).toBe('wallet_connected');
    await req('POST', `/dev/payments/latest/approve`);
    await wait(80);
    const paid = (await req<PaymentSession>('GET', `/payments/${p.id}`)).json;
    expect(paid.status).toBe('paid');
    expect(paid.method).toEqual({ wallet: 'DYNK app', channel: 'tap' });
    const tx = await req<{ paidCount: number; totalPaidCents: number }>('GET', '/transactions');
    expect(tx.json.paidCount).toBe(1);
    expect(tx.json.totalPaidCents).toBe(2415);
  });

  it('declines and expires', async () => {
    const a = await create();
    await req('POST', `/dev/payments/${a.id}/decline`);
    expect((await req<PaymentSession>('GET', `/payments/${a.id}`)).json.status).toBe('failed');
    const b = await create();
    await req('POST', `/dev/payments/${b.id}/expire`);
    expect((await req<PaymentSession>('GET', `/payments/${b.id}`)).json.status).toBe('expired');
    expect((await req('POST', `/dev/payments/${b.id}/approve`)).status).toBe(409);
  });

  it('expires on its own after the price lock', async () => {
    await req('POST', '/dev/settings', { priceLockSeconds: 0.02 });
    const p = await create();
    await wait(60);
    expect((await req<PaymentSession>('GET', `/payments/${p.id}`)).json.status).toBe('expired');
  });

  it('supersedes a live charge with a new one', async () => {
    const a = await create();
    await create(500, 0);
    expect((await req<PaymentSession>('GET', `/payments/${a.id}`)).json.status).toBe('cancelled');
  });

  it('connects a wallet through the Solana Pay transaction request', async () => {
    const p = await create();
    const meta = await req<{ label: string }>('GET', `/solana-pay/${p.id}`, undefined, false);
    expect(meta.json.label).toBe('Dynkle Café');
    const tx = await req<{ transaction: string }>('POST', `/solana-pay/${p.id}?wallet=Phantom`, { account: '7xKpAbCdEfGh3fQa' }, false);
    expect(tx.json.transaction).toBeTruthy();
    const after = (await req<PaymentSession>('GET', `/payments/${p.id}`)).json;
    expect(after.status).toBe('wallet_connected');
    expect(after.customerWallet).toBe('7xKp…3fQa');
  });

  it('accepts a remote charge from the dashboard', async () => {
    const rc = await req<{ id: string }>('POST', '/dev/remote-charge', { amountCents: 3600, reference: 'Table 4' });
    const p = (await req<PaymentSession>('POST', `/remote-charges/${rc.json.id}/accept`)).json;
    expect(p.source).toBe('dashboard');
    expect(p.reference).toBe('Table 4');
    expect(p.tipCents).toBe(0);
    expect((await req('POST', `/remote-charges/${rc.json.id}/accept`)).status).toBe(409);
  });
});

describe('catalog', () => {
  beforeEach(pair);

  it('serves the seeded menu', async () => {
    const c = await req<{ categories: { name: string }[]; items: { name: string }[] }>('GET', '/catalog');
    expect(c.json.categories.map((x) => x.name)).toContain('Coffee');
    expect(c.json.items.find((i) => i.name === 'Latte')).toBeTruthy();
  });

  it('adds, edits and deletes categories and items', async () => {
    const cat = (await req<{ id: string }>('POST', '/catalog/categories', { name: 'Specials' })).json;
    const item = (
      await req<{ id: string; variants: { priceCents: number }[] }>('POST', '/catalog/items', {
        categoryId: cat.id,
        name: 'Pumpkin latte',
        variants: [
          { name: 'Small', priceCents: 600 },
          { name: 'Large', priceCents: 700 },
        ],
      })
    ).json;
    expect(item.variants).toHaveLength(2);
    const edited = (await req<{ name: string }>('PATCH', `/catalog/items/${item.id}`, { name: 'Spiced latte' })).json;
    expect(edited.name).toBe('Spiced latte');
    expect((await req('POST', '/catalog/items', { categoryId: cat.id, name: 'Bad', variants: [] })).status).toBe(400);
    await req('DELETE', `/catalog/categories/${cat.id}`);
    const c = await req<{ items: { id: string }[] }>('GET', '/catalog');
    expect(c.json.items.some((i) => i.id === item.id)).toBe(false);
  });
});

describe('websocket', () => {
  it('pushes payment status, remote charges and unpair events to the paired till', async () => {
    await pair();
    await built.app.listen({ port: 0, host: '127.0.0.1' });
    const addr = built.app.server.address() as { port: number };
    const ws = new WebSocket(`ws://127.0.0.1:${addr.port}/ws?token=${token}`);
    const events: ServerEvent[] = [];
    ws.on('message', (m) => events.push(JSON.parse(String(m))));
    await new Promise((r) => ws.once('open', r));

    await req('POST', '/payments', { lines: [], subtotalCents: 500, tipCents: 0 });
    await req('POST', '/dev/remote-charge', { amountCents: 3600, reference: 'Table 4' });
    await req('POST', '/catalog/categories', { name: 'Specials' });
    const closed = new Promise((r) => ws.once('close', r));
    const me = await req<{ till: { id: string } }>('GET', '/terminal/me');
    await req('POST', `/dev/tills/${me.json.till.id}/unpair`);
    await closed;

    const types = events.map((e) => e.type);
    expect(types).toEqual(['payment.status', 'remote_charge', 'catalog.updated', 'terminal.unpaired']);
  });

  it('tells an unknown token it is unpaired', async () => {
    await built.app.listen({ port: 0, host: '127.0.0.1' });
    const addr = built.app.server.address() as { port: number };
    const ws = new WebSocket(`ws://127.0.0.1:${addr.port}/ws?token=nope`);
    const msg = await new Promise<string>((r) => ws.once('message', (m) => r(String(m))));
    expect(JSON.parse(msg).type).toBe('terminal.unpaired');
  });
});
