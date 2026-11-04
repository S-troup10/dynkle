# Dynkle

Dynkle is the software for DYNK's crypto point-of-sale terminal. It's an Android app that runs in kiosk mode on a counter terminal with NFC, a camera, Bluetooth and WiFi. Merchants ring up a sale on the terminal, and customers pay in crypto on Solana by tapping their phone, scanning a QR code, or connecting with a Solana wallet.

The terminal talks to the real [dynkle-api](https://github.com/Dynk-IO/dynkle-api) backend (Express + Prisma + Postgres) over its device API (`src/devices/deviceRoutes.js` there), not a server in this repo. An earlier, self-contained mock backend (`apps/mock-server`) is kept on the `archive/mock-server-backend` branch for reference.

```
apps/terminal      Expo (React Native) terminal app — Android kiosk + web preview
packages/shared    Domain types, money/GST and catalog helpers used by the app
design/            The terminal design (31 screens) the app is built from
```

## Quick start

```sh
npm install
npm run web           # terminal app in the browser on http://localhost:8081
```

By default the app points at the hosted backend, **https://dynkle-api.onrender.com**. To use a local backend instead, run the [dynkle-api](https://github.com/Dynk-IO/dynkle-api) server (see its README) and build with `EXPO_PUBLIC_API_URL=http://<your-LAN-IP>:4100`. You can also change the backend address on the pairing screen (tap the "Dashboard: …" line) or under **Admin → Dashboard server**.

To use it:

1. Open the app at 400×800 to match the terminal screen.
2. Go through onboarding to the pairing screen.
3. In the Dynkle merchant dashboard, go to **Devices → Add terminal** to get a pairing code, and type it into the app.
4. Ring up sales. The customer pays by scanning the QR / tapping NFC with a Solana wallet; the backend verifies the payment on-chain.

### On an Android terminal or emulator

```sh
cd apps/terminal
npx expo run:android --variant release     # standalone build with the native modules
```

## How the terminal works

| Area                  | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pairing**           | The dashboard mints a pairing code (Devices → Add terminal); the terminal generates an EC P-256 keypair, enters the code, and sends the backend its public key. The backend returns a short-lived device token (15 min), which the app renews by signing a server-issued nonce with the stored private key — no manual re-pairing needed.                                                                                                                              |
| **Keypad**            | Custom amounts, entered as cents (`00` key, delete). If there are already items in the order, the amount is added to it as a line.                                                                                                                                                                                                                                                                                                                                     |
| **Items**             | Categories and items with sizes, synced from the backend's flat product catalog (`GET /api/terminals/me/catalog`). A size picker opens for items with more than one size. The current order has steppers and shows the GST included (1/11). Adding an item from the terminal works (`POST /api/terminals/me/products`); renaming/deleting items and managing categories from the terminal isn't supported by this backend yet.                                         |
| **Checkout**          | Tip prompt (presets plus a custom amount; skipped when tips are off), then the charge is **armed**. While armed, the QR code, NFC tap and Connect chips are live, and the price is locked for 90 seconds. Then: customer confirming → processing on Solana → **Paid**, **Failed** (retry) or **Expired** (re-arm or edit the order).                                                                                                                                   |
| **Dashboard charges** | A charge sent from the dashboard pops up over whatever the merchant is doing, except during an active payment. Any amount already keyed in is kept and comes back afterwards. If the terminal was offline when the charge was sent, it is replayed when the terminal reconnects.                                                                                                                                                                                       |
| **Activity**          | Today's total and counts, the list of payments, and a detail view with a receipt QR.                                                                                                                                                                                                                                                                                                                                                                                   |
| **Settings**          | Business details, connection status (network, dashboard, NFC, Bluetooth) and terminal settings. **Admin settings** need the cashier PIN (`TERMINAL_STAFF_PIN` on the backend, default `1234`) and lock again after 2 minutes. They cover restart, logs, forgetting networks, **managing items**, the dashboard server, unpairing and factory reset.                                                                                                                    |
| **System states**     | An offline banner (charging is disabled), "This terminal was unpaired" (when the dashboard removes it), and the software-update screen.                                                                                                                                                                                                                                                                                                                                |
| **Reliability**       | API requests time out after 10 seconds. Reads, and charges sent with an `Idempotency-Key`, are retried on network errors, so a retry can't arm a second charge. The sale in progress is saved on the device: if the app restarts or crashes mid-payment, the charge comes back on screen and is re-checked with the dashboard. The live connection treats 45 seconds without a heartbeat as dead, and reconnects straight away when the network or the app comes back. |
| **Logs**              | The terminal keeps its last 300 log entries on the device. **Admin → View logs** shows them, and **Send logs to support** uploads them to the dashboard (`POST /terminal/logs`). Crashes are logged and show a restart screen.                                                                                                                                                                                                                                         |
| **Sound**             | Short cues when a payment is paid or fails. The **Sound** setting is saved on the terminal. The dashboard's `soundEnabled` is the default.                                                                                                                                                                                                                                                                                                                             |

### Payment payload (QR and NFC)

The backend builds the payment link for each order (`payloadForOrder` in `src/devices/deviceHub.js`) and sends it to the terminal as `paymentUrl` — either a Solana Pay transaction request (`solana:<url-encoded .../api/solana-pay/:orderId>`) or the order's checkout page, depending on how the merchant is set up. The terminal just displays it; it never builds the link itself.

On Android, `dynkle-nfc` emulates an NFC Forum Type 4 tag through host card emulation (HCE). It serves the link as an NDEF URI record, but only while a charge is armed, so phones read it like an NFC sticker.

### Native modules (`apps/terminal/modules`)

| Module         | Purpose                                                                                                                                                                                                                                   |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dynkle-nfc`   | HCE `HostApduService` serving the armed payment link as an NDEF tag, and reporting NFC state for the Tap chip.                                                                                                                            |
| `dynkle-kiosk` | Lock task mode, device-owner admin receiver, immersive mode and restart/reboot. The `plugins/withKioskLauncher.js` config plugin makes the app the HOME launcher. Setup is in [its README](apps/terminal/modules/dynkle-kiosk/README.md). |
| `dynkle-wifi`  | WiFi scan and join (device owner configures networks directly; otherwise it uses network suggestions or the WiFi panel), plus Bluetooth state.                                                                                            |

In the web preview these fall back to simulated hardware. **Admin → Simulate tap failure** previews the "Tap unavailable" state.

## DYNK app Tap to Pay (Bluetooth)

**Currently disconnected.** This feature talked to the mock server's DYNK-token endpoints (`/payments/:id/ble-session` etc.), which the real [dynkle-api](https://github.com/Dynk-IO/dynkle-api) backend doesn't implement — it has no DYNK-token rail, only Solana Pay / EVM checkout. The native Bluetooth module and the client code below are untouched and still compile; they're just never invoked, because the backend never sends a payment a `dynk` quote (`apps/terminal/src/api/mapping.ts`'s order mapping doesn't set one). Revisit this once the backend adds an equivalent rail.

Tap to Pay in the DYNK app is **Bluetooth LE, not NFC**. The terminal plays the DYNK app's _receiver_: it runs a GATT server that serves a small signed session, and the customer's phone (the _sender_) connects when it's held against the terminal, reads the session, pays on Solana itself, and writes its status back. This is phase 1 of the integration spec. It works with today's DYNK app on iPhone and Android, with no app release.

|                               |                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GATT service / characteristic | `7a1e8f10-7a2c-4b7e-9b7a-1f6a2e6b9c10` / `7a1e8f11-7a2c-4b7e-9b7a-1f6a2e6b9c10`, READ + WRITE, no pairing                                                                                                                                                                                                                                    |
| Session (READ)                | `{"v":2,"n":<uuid>,"e":<expiry ms>,"d":<name ≤24>,"a":{"SOL":<merchant wallet>},"s":<bs58 ed25519 sig of n>}`, ≤ 480 bytes, 60 s lifetime, single use                                                                                                                                                                                        |
| Phone writes                  | `{"transferStatus":"processing"\|"confirmed"\|"failed","txSignature",…}` (iPhones may split this into a prepared write: the module reassembles it)                                                                                                                                                                                           |
| Native module                 | `apps/terminal/modules/dynkle-ble` (Kotlin). Waits for the service before advertising, reassembles prepared writes, stops advertising and refuses other phones once one says `processing`, reports disconnects, and has configurable TX power (**Admin → Tap to Pay range**: tune it on the FP9840 so about 3 cm triggers and 30 cm doesn't) |

**How a charge goes:** every charge gets a DYNK quote (`payment.dynk`) at the dashboard's `dynkPerAud` rate. Today the customer types the amount in the DYNK app, so the armed screen shows exactly what to enter. The raw amount is unique among open charges to the same wallet, so the chain can tell two tills apart. The terminal fetches a signed session (`POST /payments/:id/ble-session`), swaps in a new one while at least 15 s are left on the current one, and reports the phone's read, `processing`, `failed` and disconnect (`POST /payments/:id/ble-event`). On `confirmed` it hands over the transaction signature (`POST /payments/:id/claim-signature`).

**The terminal never decides "Paid".** The dashboard checks the transaction on chain: no error, the merchant's balance of the DYNK mint went up by the charge's amount, inside the charge window, and the signature hasn't paid another charge. Underpaid → `failed` with `failureCode: "wrong_amount"` and the shortfall. Overpaid → `paid` with the excess flagged. A different token → nothing received → `wrong_amount`. A **chain watcher** also polls the merchant's token account, so a lost or garbled Bluetooth write doesn't lose a payment.

Phase 2 (the terminal sets the amount and a charge reference in the session) needs a DYNK app and backend change, and is on hold along with the rest of this section until the real backend has a DYNK-token rail.

## Backend API

The terminal's device-side API — pairing, catalog, orders, and the `/ws/terminal` live connection — is implemented by [dynkle-api](https://github.com/Dynk-IO/dynkle-api), specifically `src/devices/deviceRoutes.js`, `src/devices/deviceHub.js` and `src/devices/deviceAuth.js`. See that repo's README for the full endpoint reference, environment variables and deploy instructions. The mapping between its responses and this app's `PaymentSession` / `Catalog` types lives in `apps/terminal/src/api/mapping.ts`.

## Checks

```sh
npm run check         # typecheck + lint + format check + all tests
npm test              # shared + terminal (Jest + React Native Testing Library)
npm run typecheck
npm run lint          # ESLint: shared (eslint.config.mjs) and the terminal (Expo config)
npm run format        # Prettier (format:check to verify)
```

## Not in V1

- DYNK Tap to Pay phase 2 (terminal-set amount and on-chain charge reference) and phase 3 (phone signs, terminal broadcasts)
- Real Solana settlement and the real merchant dashboard (both are mocked)
- The production pairing/connection protocol
- Promo codes
