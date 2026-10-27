// End-to-end walk through the terminal's web build against the mock dashboard.
//
//   npm run server          # terminal 1: mock dashboard on :4000
//   npm run web             # terminal 2: Expo web on :8081
//   node e2e/web-flow.mjs   # terminal 3 (SHOTS=dir to save screenshots)
//
// Uses the Chromium that ships with Playwright.
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

// Resolved through require so a globally installed Playwright (NODE_PATH) works too.
const { chromium } = createRequire(import.meta.url)('playwright');

const APP = process.env.APP_URL ?? 'http://localhost:8081';
const API = process.env.API_URL ?? 'http://localhost:4000';
const SHOTS = process.env.SHOTS;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

// Hosted mock dashboards protect /dev with a password (DEV_PASSWORD on Render).
const devAuth = process.env.DEV_PASSWORD ? { authorization: `Basic ${Buffer.from(`e2e:${process.env.DEV_PASSWORD}`).toString('base64')}` } : {};
const devState = async () => (await fetch(`${API}/dev/state`, { headers: devAuth })).json();
const dev = async (path, body = {}) => {
  const r = await fetch(`${API}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...devAuth }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${path} -> ${r.status} ${await r.text()}`);
  return r.json();
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 400, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
process.on('exit', (code) => {
  if (code !== 0 && errors.length) console.error('\nBrowser errors:\n' + errors.join('\n'));
});

// Screens lower in the stack stay mounted, so only match what's on screen.
const id = (t) => page.locator(`[data-testid="${t}"] >> visible=true`).first();
const text = (t) => page.getByText(t, { exact: true }).locator('visible=true').first();
let n = 0;
const shot = async (name) => {
  await page.waitForTimeout(350);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${String(++n).padStart(2, '0')}-${name}.png` });
};
const step = (msg) => console.log(`✓ ${msg}`);
const keys = async (digits) => {
  for (const d of digits) await id(`key-${d}`).click();
};

await page.goto(APP);

// ---------- Onboarding + pairing ----------
await id('get-started').waitFor();
await shot('welcome');
await id('get-started').click();
await shot('intro-1');
await id('intro-next').click();
await page.waitForTimeout(500);
await shot('intro-2');
await id('intro-next').click();
await page.waitForTimeout(500);
await shot('intro-3');
await id('intro-next').click();
await id('network-connect').waitFor();
await shot('network');
await id('network-connect').click();
const codeEl = id('pairing-code');
await page.waitForFunction(() => /^[A-Z2-9]{6}$/.test(document.querySelector('[data-testid="pairing-code"]')?.getAttribute('aria-label') ?? ''));
const code = await codeEl.getAttribute('aria-label');
await shot('pairing-code');
await dev('/dev/pairing/claim', { code, tillName: 'Till 2' });
await id('start-selling').waitFor({ timeout: 10_000 });
await shot('paired');
step(`paired with code ${code}`);
await id('start-selling').click();

// ---------- Keypad charge with tip, approved ----------
await id('keypad-charge').waitFor();
await keys('2100');
await shot('keypad');
await id('keypad-charge').click();
await id('tip-15').waitFor();
await shot('tip');
await id('tip-15').click();
await id('armed-amount').waitFor();
if ((await id('armed-amount').innerText()) !== '$24.15') throw new Error('armed amount wrong');
await shot('armed');
await dev('/dev/payments/latest/connect', { wallet: 'DYNK app', channel: 'tap' });
await id('cancel-rearm').waitFor();
await shot('confirming');
await dev('/dev/payments/latest/approve');
await text('Confirming payment').waitFor();
await shot('processing');
await id('paid-title').waitFor({ timeout: 10_000 });
await shot('paid');
step('keypad sale with 15% tip paid');
await id('new-sale').click();

// ---------- Items -> order ----------
await id('tab-items').click();
await id('category-Coffee').waitFor();
await shot('menu');
await id('category-Coffee').click();
await id('item-Latte').waitFor();
await id('item-Latte').click();
await id('size-Medium').click();
await id('qty-plus').click();
await shot('size-picker');
await id('add-to-order').click();
await id('item-Latte').waitFor();
await shot('category');
await id('back').click();
await id('category-Food').click();
await id('category-Breads').click();
await id('item-Banana bread').click();
await id('view-order').click();
await id('order-total').waitFor();
if ((await id('order-total').innerText()) !== '$16.50') throw new Error('order total wrong');
await shot('order');
step('built an order from the menu');

// ---------- Declined, retried, expired ----------
await id('order-charge').click();
await id('no-tip').click();
await id('armed-amount').waitFor();
await dev('/dev/payments/latest/decline');
await id('try-again').waitFor();
await shot('failed');
await id('try-again').click();
await id('armed-amount').waitFor();
await dev('/dev/payments/latest/expire');
await id('rearm').waitFor();
await shot('expired');
await id('expired-cancel').click();
await id('keypad-charge').waitFor();
step('decline -> retry -> expire -> cancel');

// ---------- Tap unavailable preview ----------
await id('open-settings').click();
await id('admin-settings').click();
await keys('123456');
await id('unlock').click();
await text('Simulate tap failure').click();
// Navigate in-app: a reload would reset the simulated reader.
await id('back').click();
await id('admin-settings').waitFor();
await id('back').click();
await id('keypad-charge').waitFor();
await keys('500');
await id('keypad-charge').click();
await id('no-tip').click();
await text("Tap isn't working right now").waitFor();
await shot('tap-unavailable');
await id('cancel-charge').click();
step('tap unavailable banner');
await page.reload();

// ---------- Remote charge from the dashboard ----------
await page.goto(`${APP}/keypad`);
await id('keypad-charge').waitFor();
await keys('840');
const { tills } = await devState();
await dev('/dev/remote-charge', { tillId: tills.at(-1).id, amountCents: 3600, reference: 'Table 4' });
await id('accept-remote').waitFor();
await shot('remote-charge');
await id('accept-remote').click();
await text('Sent from dashboard · Table 4').waitFor();
await shot('armed-dashboard');
await dev('/dev/payments/latest/approve');
await id('paid-title').waitFor({ timeout: 10_000 });
await id('new-sale').click();
await id('keypad-amount').waitFor();
if ((await id('keypad-amount').innerText()) !== '$8.40') throw new Error('keyed entry was not restored');
step('remote charge accepted, keypad entry restored');

// ---------- Activity ----------
await id('tab-activity').click();
await id('today-total').waitFor();
await shot('activity');
await page.locator('[data-testid^="tx-"] >> visible=true').first().click();
await text('Paid with').waitFor();
await shot('transaction');
step('activity + detail');

// ---------- Settings, admin, manage items, unpair ----------
await page.goto(`${APP}/settings`);
await id('admin-settings').waitFor();
await shot('settings');
await id('admin-settings').click();
await keys('9');
await shot('admin-code');
await keys('99999');
await id('unlock').click();
await text("That code isn't right. Try again.").waitFor();
await keys('123456');
await id('unlock').click();
await id('manage-items').waitFor();
await shot('admin');
await id('manage-items').click();
await id('manage-Coffee').click();
await id('add-item').click();
await id('item-name').fill('Pumpkin latte');
await id('size-price-0').fill('6.50');
await id('save-item').click();
await id('edit-Pumpkin latte').waitFor();
await shot('manage-category');
step('added an item from the terminal');
await id('back').click();
await id('manage-Coffee').waitFor();
await id('back').click();
await id('unpair').waitFor();
await id('unpair').click();
await id('confirm-unpair').waitFor();
await shot('unpair-confirm');
await page.goBack();

// ---------- Offline + unpaired by dashboard ----------
await page.goto(`${APP}/keypad`);
await id('keypad-charge').waitFor();
await page.context().setOffline(true);
await page.evaluate(() => (navigator.connection ?? window).dispatchEvent(new Event(navigator.connection ? 'change' : 'offline')));
await id('offline-banner').waitFor({ timeout: 15_000 });
await shot('offline');
await page.context().setOffline(false);
await page.evaluate(() => (navigator.connection ?? window).dispatchEvent(new Event(navigator.connection ? 'change' : 'online')));
step('offline banner');

await dev('/dev/software-update', { version: '1.0.1' });
await text('Updating').waitFor();
await shot('update');
await id('keypad-charge').waitFor({ timeout: 15_000 });
step('software update screen');

const state = await devState();
await dev(`/dev/tills/${state.tills.at(-1).id}/unpair`);
await id('pair-again').waitFor({ timeout: 10_000 });
await shot('unpaired');
await id('pair-again').click();
await id('pairing-code').waitFor();
step('unpaired by dashboard -> pair again');

await browser.close();
const real = errors.filter((e) => !/DevTools|favicon|ERR_INTERNET_DISCONNECTED|WebSocket|Failed to load resource/.test(e));
if (real.length) {
  console.error('Console errors:\n' + real.join('\n'));
  process.exit(1);
}
console.log('All flows passed.');
