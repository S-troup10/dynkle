export const devPanelHtml = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Dynkle Mock Dashboard</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@700;800&family=Outfit:wght@400;500;600&display=swap" rel="stylesheet" />
<style>
  :root { --ink:#212320; --muted:#5A5C58; --orange:#FF8000; --green:#28AD0D; --red:#D93A1E; --line:rgba(33,35,32,.1); }
  * { box-sizing: border-box; }
  body { margin:0; font-family: Outfit, system-ui, sans-serif; color: var(--ink); background: #F6F6F2; }
  header { padding: 20px 24px; display:flex; align-items:center; gap:12px; border-bottom:1px solid var(--line); background:#fff; }
  header h1 { font-family: Orbitron, sans-serif; font-size: 18px; margin:0; }
  header span { color: var(--muted); font-size: 14px; }
  main { display:grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap:16px; padding:16px; }
  section { background:#fff; border-radius:20px; padding:18px; box-shadow: 0 4px 12px rgba(33,35,32,.05); }
  h2 { font-size: 13px; letter-spacing: 2px; text-transform: uppercase; color: var(--muted); margin: 0 0 12px; font-weight:600; }
  .row { display:flex; gap:8px; align-items:center; flex-wrap: wrap; margin: 6px 0; }
  .code { font-family: Orbitron, sans-serif; font-weight:800; font-size: 22px; letter-spacing: 4px; }
  .amt { font-family: Orbitron, sans-serif; font-weight:700; }
  button { font: inherit; font-weight:600; border:0; border-radius:999px; padding:9px 14px; cursor:pointer; background: rgba(33,35,32,.06); color: var(--ink); }
  button.pri { background: var(--orange); color:#fff; }
  button.ok { background: var(--green); color:#fff; }
  button.bad { background: var(--red); color:#fff; }
  input, select { font: inherit; padding: 8px 12px; border-radius: 12px; border: 1px solid var(--line); min-width: 0; }
  .muted { color: var(--muted); font-size: 13px; }
  .pill { font-size: 12px; font-weight:600; padding: 3px 9px; border-radius: 999px; background: rgba(33,35,32,.06); }
  .pill.paid { background: rgba(40,173,13,.12); color: #1d7f0a; }
  .pill.failed { background: rgba(217,58,30,.12); color: var(--red); }
  .pill.armed, .pill.wallet_connected, .pill.approved, .pill.confirming { background: rgba(255,128,0,.14); color: #E66F00; }
  table { width:100%; border-collapse: collapse; font-size: 14px; }
  td { padding: 6px 4px; border-top: 1px solid var(--line); }
  #toast { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); background: var(--ink); color:#fff; padding: 10px 16px; border-radius: 999px; opacity:0; transition: opacity .2s; }
</style>
</head>
<body>
<header><h1>DYNKLE</h1><span>Mock merchant dashboard &amp; customer wallet simulator</span></header>
<main>
  <section>
    <h2>Pair a terminal</h2>
    <div id="codes" class="muted">No terminal is waiting for a code.</div>
    <div class="row">
      <input id="code" placeholder="Code e.g. K7Q4PM" maxlength="6" style="text-transform:uppercase;width:150px" />
      <input id="tillName" placeholder="Till name" value="Till 2" style="width:120px" />
      <button class="pri" onclick="claim()">Add terminal</button>
    </div>
  </section>

  <section>
    <h2>Terminals</h2>
    <div id="tills" class="muted">None paired yet.</div>
  </section>

  <section>
    <h2>Customer wallet</h2>
    <div id="live" class="muted">No charge is armed.</div>
  </section>

  <section>
    <h2>Send a charge to a terminal</h2>
    <div class="row">
      <select id="rcTill"></select>
      <input id="rcAmount" placeholder="Amount" value="36.00" style="width:100px" />
      <input id="rcRef" placeholder="Reference" value="Table 4" style="width:120px" />
      <button class="pri" onclick="remoteCharge()">Send</button>
    </div>
  </section>

  <section>
    <h2>Terminal settings</h2>
    <div class="row"><label><input type="checkbox" id="tips" onchange="saveSettings()" /> Tips on</label></div>
    <div class="row">Tip presets <input id="presets" style="width:120px" onchange="saveSettings()" /> <span class="muted">e.g. 10,15,20</span></div>
    <div class="row">Price lock <input id="lock" style="width:70px" onchange="saveSettings()" /> seconds</div>
    <div class="row"><button onclick="post('/dev/software-update',{version:'1.0.1'}).then(()=>toast('Update pushed'))">Push software update</button></div>
  </section>

  <section>
    <h2>Add a menu item</h2>
    <div class="row"><select id="itemCat"></select><input id="itemName" placeholder="Name" style="width:140px" /></div>
    <div class="row"><input id="itemSizes" placeholder="Small:4.80, Medium:5.50" style="flex:1" /><button class="pri" onclick="addItem()">Add</button></div>
    <div class="muted">Changes sync to paired terminals instantly.</div>
  </section>

  <section style="grid-column: 1 / -1">
    <h2>Recent payments</h2>
    <table id="payments"></table>
  </section>
</main>
<div id="toast"></div>
<script>
const $ = (id) => document.getElementById(id);
const money = (c) => '$' + (c / 100).toFixed(2);
let state = null;
let editingSettings = false;

function toast(msg) { const t = $('toast'); t.textContent = msg; t.style.opacity = 1; clearTimeout(t._h); t._h = setTimeout(() => t.style.opacity = 0, 1800); }
async function post(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { toast(j.error || 'Request failed'); throw new Error(j.error); }
  refresh();
  return j;
}
async function claim() {
  const code = $('code').value.trim().toUpperCase() || undefined;
  await post('/dev/pairing/claim', { code, tillName: $('tillName').value });
  $('code').value = ''; toast('Terminal paired');
}
function remoteCharge() {
  const amountCents = Math.round(parseFloat($('rcAmount').value) * 100);
  post('/dev/remote-charge', { tillId: $('rcTill').value, amountCents, reference: $('rcRef').value }).then(() => toast('Charge sent'));
}
function saveSettings() {
  post('/dev/settings', {
    tipsEnabled: $('tips').checked,
    tipPresets: $('presets').value.split(',').map(Number).filter((n) => n > 0),
    priceLockSeconds: Number($('lock').value) || 90,
  }).then(() => toast('Settings saved'));
}
function addItem() {
  const variants = $('itemSizes').value.split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
    const [name, price] = s.includes(':') ? s.split(':') : ['Regular', s];
    return { name: name.trim(), priceCents: Math.round(parseFloat(price) * 100) };
  });
  post('/dev/catalog/items', { categoryId: $('itemCat').value, name: $('itemName').value, variants }).then(() => { $('itemName').value=''; toast('Item added'); });
}
const act = (id, what, body) => post('/dev/payments/' + id + '/' + what, body);

function render() {
  const s = state;
  $('codes').innerHTML = s.pairingCodes.length
    ? s.pairingCodes.map((c) => '<div class="row"><span class="code">' + c.code + '</span><button onclick="$(\\'code\\').value=\\'' + c.code + '\\';claim()">Use</button></div>').join('')
    : 'No terminal is waiting for a code.';
  $('tills').innerHTML = s.tills.length
    ? s.tills.map((t) => '<div class="row"><b>' + t.name + '</b><span class="muted">' + t.id + '</span><button onclick="renameTill(\\'' + t.id + '\\')">Rename</button><button class="bad" onclick="post(\\'/dev/tills/' + t.id + '/unpair\\').then(()=>toast(\\'Unpaired\\'))">Unpair</button></div>').join('')
    : 'None paired yet.';
  const sel = $('rcTill'); const cur = sel.value;
  sel.innerHTML = s.tills.map((t) => '<option value="' + t.id + '">' + t.name + '</option>').join('');
  if (cur) sel.value = cur;

  const live = s.payments.filter((p) => ['armed','wallet_connected','approved','confirming'].includes(p.status));
  $('live').innerHTML = live.length ? live.map((p) => {
    const left = Math.max(0, Math.round((Date.parse(p.expiresAt) - Date.now()) / 1000));
    let btns = '';
    if (p.status === 'armed') btns =
      '<button onclick="act(\\'' + p.id + '\\',\\'connect\\',{wallet:\\'DYNK app\\',channel:\\'tap\\'})">DYNK tap</button>' +
      '<button onclick="act(\\'' + p.id + '\\',\\'connect\\',{wallet:\\'DYNK app\\',channel:\\'bluetooth\\'})">DYNK connect</button>' +
      '<button onclick="act(\\'' + p.id + '\\',\\'connect\\',{wallet:\\'Phantom\\',channel:\\'qr\\'})">Phantom scan</button>';
    if (p.status === 'armed' || p.status === 'wallet_connected') btns +=
      '<button class="ok" onclick="act(\\'' + p.id + '\\',\\'approve\\')">Approve</button>' +
      '<button class="bad" onclick="act(\\'' + p.id + '\\',\\'decline\\')">Decline</button>' +
      '<button onclick="act(\\'' + p.id + '\\',\\'expire\\')">Let it expire</button>';
    return '<div class="row"><span class="amt">' + money(p.totalCents) + '</span><span class="pill ' + p.status + '">' + p.status.replace('_',' ') + '</span>' +
      (p.reference ? '<span class="muted">' + p.reference + '</span>' : '') + '<span class="muted">' + left + 's left</span></div><div class="row">' + btns + '</div>' +
      '<div class="muted" style="word-break:break-all">' + p.qrUrl + '</div>';
  }).join('<hr/>') : 'No charge is armed.';

  if (!editingSettings) {
    $('tips').checked = s.settings.tipsEnabled;
    $('presets').value = s.settings.tipPresets.join(',');
    $('lock').value = s.settings.priceLockSeconds;
  }
  const ic = $('itemCat'); const icv = ic.value;
  ic.innerHTML = s.catalog.categories.map((c) => '<option value="' + c.id + '">' + (c.parentId ? '— ' : '') + c.name + '</option>').join('');
  if (icv) ic.value = icv;

  $('payments').innerHTML = s.payments.map((p) =>
    '<tr><td>' + new Date(p.createdAt).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}) + '</td><td class="amt">' + money(p.totalCents) + '</td><td><span class="pill ' + p.status + '">' + p.status.replace('_',' ') + '</span></td><td class="muted">' +
    (p.method ? p.method.wallet + ' · ' + p.method.channel : '') + '</td><td class="muted">' + (p.reference || p.lines.map((l) => l.name).slice(0,2).join(', ')) + '</td></tr>').join('');
}
function renameTill(id) { const name = prompt('Till name'); if (name) post('/dev/tills/' + id + '/rename', { name }); }
async function refresh() { state = await (await fetch('/dev/state')).json(); render(); }
['tips','presets','lock'].forEach((id) => { const el = $(id); el.addEventListener('focus', () => editingSettings = true); el.addEventListener('blur', () => editingSettings = false); });
refresh(); setInterval(refresh, 1000);
</script>
</body>
</html>`;
