# Dynkle

Dynkle is the software for DYNK's crypto point-of-sale terminal. It's an Android app that runs in kiosk mode on a counter terminal with NFC, a camera, Bluetooth and WiFi. Merchants ring up a sale on the terminal, and customers pay in crypto on Solana by tapping their phone, scanning a QR code, or connecting with the DYNK app.

This repo is **V1**. It contains the full terminal app and a **mock merchant dashboard**, so the whole flow can be tested in isolation.

```
apps/terminal      Expo (React Native) terminal app — Android kiosk + web preview
apps/mock-server   Mock merchant dashboard: REST + WebSocket + /dev control panel
packages/shared    Domain types, money/GST and catalog helpers shared by both
design/            The terminal design (31 screens) the app is built from
e2e/               Playwright walk-through of every flow against the web build
```

## Quick start

```sh
npm install
npm run server        # mock dashboard on http://localhost:4000 (dev panel at /dev)
npm run web           # terminal app in the browser on http://localhost:8081
```

To use it:

1. Open the app at 400×800 to match the terminal screen.
2. Go through onboarding until a pairing code appears.
3. On http://localhost:4000/dev, click **Use** next to the code. The terminal pairs on its own.
4. Ring up sales. The dev panel acts as the customer's wallet: connect, approve, decline or let the charge expire. It also acts as the dashboard: send a charge to the terminal, toggle tips, add menu items, push an update or unpair.

### On an Android terminal or emulator

```sh
cd apps/terminal
npx expo run:android --variant release     # standalone build with the native modules
```

The app connects to the hosted mock dashboard at **https://dynkle-mock.onrender.com** by default. Pair from https://dynkle-mock.onrender.com/dev (the password is `DEV_PASSWORD` in Render).

To use a local server instead, build with `EXPO_PUBLIC_API_URL=http://<your-LAN-IP>:4000`. You can also change the dashboard address on the pairing screen (tap the "Dashboard: …" line) or under **Admin → Dashboard server**.

## How the terminal works

| Area | What it does |
| --- | --- |
| **Pairing** | The terminal requests a 6-character code (10-minute lifetime, refreshed automatically). It polls until the dashboard claims the code, then stores a device token. The production pairing protocol will replace this later. |
| **Keypad** | Custom amounts, entered as cents (`00` key, delete). If there are already items in the order, the amount is added to it as a line. |
| **Items** | Categories, groups and items with sizes, synced from the dashboard. Groups show up either as filter chips (Coffee) or as sub-categories (Food → Breads). A size picker opens for items with more than one size. The current order has steppers and shows the GST included (1/11). |
| **Checkout** | Tip prompt (presets plus a custom amount; skipped when tips are off), then the charge is **armed**. While armed, the QR code, NFC tap and Connect chips are live, and the price is locked for 90 seconds. Then: customer confirming → processing on Solana → **Paid**, **Failed** (retry) or **Expired** (re-arm or edit the order). |
| **Dashboard charges** | A charge sent from the dashboard pops up over whatever the merchant is doing, except during an active payment. Any amount already keyed in is kept and comes back afterwards. If the terminal was offline when the charge was sent, it is replayed when the terminal reconnects. |
| **Activity** | Today's total and counts, the list of payments, and a detail view with a receipt QR. |
| **Settings** | Business details, connection status (network, dashboard, NFC, Bluetooth) and terminal settings. **Admin settings** need the admin code (mock: `123456`) and lock again after 2 minutes. They cover restart, logs, forgetting networks, **managing items**, the dashboard server, unpairing and factory reset. |
| **System states** | An offline banner (charging is disabled), "This terminal was unpaired" (when the dashboard removes it), and the software-update screen. |

### Payment payload (QR and NFC)

The mock server creates a payment session for each charge, and the payload has two layers:

- **Inner layer:** `solanaPayUrl` is a Solana Pay transaction request: `solana:<url-encoded https://…/solana-pay/<id>>`. The mock server's `/solana-pay/:id` endpoint follows the spec. `GET` returns the label and icon. `POST {account}` returns a stub transaction and marks the customer's wallet as connected.
- **Outer layer:** `qrUrl` is a DYNK universal link, `https://pay.dynk.io/p/<id>?r=<solanaPayUrl>`. The QR code and the NFC tag both carry this link. The DYNK app opens it directly, and a web fallback can hand the wrapped Solana Pay request to Phantom, Solflare or Backpack.

On Android, `dynkle-nfc` emulates an NFC Forum Type 4 tag through host card emulation (HCE). It serves the link as an NDEF URI record, but only while a charge is armed, so phones read it like an NFC sticker.

### Native modules (`apps/terminal/modules`)

| Module | Purpose |
| --- | --- |
| `dynkle-nfc` | HCE `HostApduService` serving the armed payment link as an NDEF tag, and reporting NFC state for the Tap chip. |
| `dynkle-kiosk` | Lock task mode, device-owner admin receiver, immersive mode and restart/reboot. The `plugins/withKioskLauncher.js` config plugin makes the app the HOME launcher. Setup is in [its README](apps/terminal/modules/dynkle-kiosk/README.md). |
| `dynkle-wifi` | WiFi scan and join (device owner configures networks directly; otherwise it uses network suggestions or the WiFi panel), plus Bluetooth state. |

In the web preview these fall back to simulated hardware. **Admin → Simulate tap failure** previews the "Tap unavailable" state.

## Mock dashboard API

These endpoints are what the real merchant dashboard needs to provide.

| | |
| --- | --- |
| `POST /pairing/codes`, `GET /pairing/codes/:code` | Pairing code issue and poll (no auth) |
| `POST /pairing/claim {code, tillName}` | Dashboard claims a code |
| `GET /terminal/me`, `POST /terminal/unpair`, `POST /admin/verify` | Terminal profile, unpair and admin code check (bearer token) |
| `GET/POST/PATCH/DELETE /catalog…` | Menu: categories (with groups) and items with sizes |
| `POST /payments`, `GET /payments/:id`, `POST /payments/:id/cancel` | Payment sessions |
| `GET /transactions` | Today's activity for the till |
| `POST /remote-charges/:id/accept\|dismiss` | Answer a dashboard-sent charge |
| `GET/POST /solana-pay/:id` | Solana Pay transaction request (stub) |
| `WS /ws?token=` | `payment.status`, `remote_charge`, `catalog.updated`, `settings.updated`, `terminal.unpaired`, `software_update` |
| `/dev`, `POST /dev/…` | Control panel and scriptable simulators for tests |

## Deploy the mock dashboard (Render)

This deploys the mock dashboard so the terminal can reach it over the internet, with no server running on your own computer.

1. Push this branch, then in [Render](https://dashboard.render.com) go to **New → Blueprint**. Pick this repo and branch, then **Apply**. Render builds the `Dockerfile` described in `render.yaml`.
2. When it's live, open **dynkle-mock → Environment** and copy `DEV_PASSWORD`. It's generated for you.
3. Open `https://<your-service>.onrender.com/dev`. The browser asks for a login: the username can be anything, and the password is `DEV_PASSWORD`.
4. Point the terminal at the hosted dashboard in one of two ways:
   - At build time: put `EXPO_PUBLIC_API_URL=https://<your-service>.onrender.com` in `apps/terminal/.env.local`, then build (`npx expo run:android --variant release`).
   - In the app: tap **Dashboard: …** on the pairing screen, or go to **Admin → Dashboard server**.

The terminal API, `/ws` and `/solana-pay` stay open. Only `/dev` needs the password. Payment links use `https://` automatically behind Render's proxy.

**On the free plan:**
- The service sleeps after about 15 minutes with no traffic, and the first request after that takes about 30 seconds.
- Data lives in memory, so every restart or redeploy wipes it. Terminals then show "This terminal was unpaired", and you pair them again.

The $7/month Starter plan stays awake.

Vercel won't work: it only runs short-lived serverless functions, and the mock needs a long-running process for WebSockets, in-memory state and the price-lock timers.

To run the e2e walk-through against the hosted dashboard:
`API_URL=https://<your-service>.onrender.com DEV_PASSWORD=… node e2e/web-flow.mjs`, with the web app running locally.

## Checks

```sh
npm test              # shared + mock server (Vitest) + terminal logic (Jest)
npm run typecheck
npm run lint -w @dynkle/terminal
node e2e/web-flow.mjs # with server + web running; needs Playwright (SHOTS=dir saves screenshots)
```

## Not in V1

- Bluetooth "DCAP" tap-to-connect (the **Connect** chip is wired up, and the dev panel simulates it)
- Real Solana settlement and the real merchant dashboard (both are mocked)
- The production pairing/connection protocol
- Promo codes
