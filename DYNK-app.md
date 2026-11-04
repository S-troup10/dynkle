# Dynkle ↔ DYNK app: Bluetooth Tap to Pay

**Audience:** an engineer or coding agent building the Dynkle side (terminal software on the SZFP FP9840 Android POS, plus the Dynkle backend) so that a customer holding the **DYNK wallet app** can pay the terminal with **Tap to Pay over Bluetooth LE**.

**Scope:** Bluetooth only. Paying by QR code or deep link is out of scope here.

**Source of truth:** repo `Dynk-IO/nft-wallet-ecosystem-native`, branch `bugfix/1509`, commit `0b5af28d` (30 Oct 2026). Every behaviour below was read from that code. File paths are relative to the repo root. If the app has moved on, re-check the files in §6 before relying on a detail.

**Conventions in this doc**
- **TODAY**: how the shipped app behaves. Dynkle can rely on it with no app release.
- **PROPOSED**: a change to the DYNK app or DYNK backend that this doc specifies. Nothing marked PROPOSED exists yet.
- "Sender" / "payer" = the customer's phone. "Receiver" = whoever gets paid (another phone today, the Dynkle terminal in this project).

---

## 0. Summary

- **Tap to Pay in the DYNK app is Bluetooth LE, not NFC.** The only NFC code in the app is for Tangem cards. The terminal's NFC reader isn't involved.
- The **receiver** runs a BLE GATT server and serves a small signed JSON "session" (its wallet address). The **sender** (customer phone) scans, connects only when the phones are touching (RSSI ≥ −50 dBm), reads the session, verifies the signature, pays on chain itself (via DYNK's backend), and writes the transaction signature back to the receiver over BLE.
- **The Dynkle terminal plays the receiver.** It can implement the exact same GATT server, so it works with today's app on both iPhone and Android, with no app release.
- **The limitation TODAY:** the customer types the amount on their phone. Phase 2 (§3) is a small, backwards-compatible app change that lets the terminal send the amount and a charge reference.
- **The terminal never decides "Paid" on its own.** The Dynkle backend verifies amount, token, recipient and time on chain (§2.4).

| Phase | What | App change? |
|---|---|---|
| 1 (§2) | Terminal = receiver. Customer types the amount. Backend verifies on chain | No |
| 2 (§3) | Terminal sends the locked amount + charge reference in the session | Yes, small |
| 3 (§4) | Phone only signs, terminal broadcasts (offline customer) | Yes, large |

---

## 1. How Tap to Pay works in the app TODAY

### 1.1 Roles and libraries
- **Receiver** ("Tap to Receive", `src/screens/receive/BLEReceiveScreen.tsx`) is a **BLE peripheral / GATT server**. It uses the in-repo Expo module `modules/dynk-ble-peripheral` (Kotlin `DynkBlePeripheralModule.kt`, Swift `DynkBlePeripheralModule.swift`), driven by `src/services/ble/bleAdvertiser.ts`.
- **Sender** ("Tap to Pay", `src/screens/send/BLEScanScreen.tsx`) is a **BLE central**. It uses `react-native-ble-plx` ^3.5.1, driven by `src/services/ble/bleScanner.ts`.
- **For Dynkle, the terminal plays the Receiver.** The customer's DYNK app is the Sender and needs no change for Phase 1.

### 1.2 GATT profile

| Item | Value |
|---|---|
| Service UUID (primary) | `7a1e8f10-7a2c-4b7e-9b7a-1f6a2e6b9c10` |
| Session characteristic UUID | `7a1e8f11-7a2c-4b7e-9b7a-1f6a2e6b9c10` |
| Characteristic properties | `READ` + `WRITE` (write with response). No notify needed |
| Permissions | readable + writable, **no encryption / pairing** |
| Advertising | connectable, service UUID in the advertisement, device name **not** included. Android: `ADVERTISE_MODE_LOW_LATENCY`, `ADVERTISE_TX_POWER_HIGH` |
| Read value | UTF-8 JSON session payload (§1.3), ≤ 480 bytes |
| Write value (from sender) | UTF-8 JSON status message (§1.6) |

Constants live in `src/services/ble/bleTypes.ts`.

### 1.3 Session payload (what the receiver serves on READ)

Version 2 (compact, current). Built by `buildBleWirePayload()` (`bleWirePayload.ts`), parsed by `parseBleSession()` (`bleSessionParser.ts`).

```json
{
  "v": 2,
  "n": "3f1c2a8e-5b7d-4e0a-9c6f-2d8b1a4e7c90",
  "e": 1762070400000,
  "d": "Blackall St Cafe",
  "a": { "SOL": "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin" },
  "s": "<bs58 ed25519 signature of n>"
}
```

| Field | Meaning |
|---|---|
| `v` | Always `2` |
| `n` | Nonce = session id. A UUID v4 string. **Single use**: the sender keeps a set of used session ids for the app's lifetime and rejects repeats |
| `e` | Expiry, unix **milliseconds**. Today's receiver sets now + 60 000 ms. The sender rejects an expired session |
| `d` | Display name shown to the payer. The receiver truncates it to 24 chars, then to 8 if the payload is too big |
| `a` | Map of address per account family: `SOL`, `EVM`, `BTC`, `LTC`, `TRX`. For Dynkle, `{"SOL": "<merchant receiving address>"}` is enough |
| `k` | Optional. Letters `E`,`B`,`L`,`T` = families omitted from `a` because they derive from the secp256k1 key that produced `p`. Not needed for Dynkle |
| `s` | Optional. ed25519 signature of `n` by the SOL address's key (§1.4) |
| `p` | Optional. secp256k1 recoverable signature of sha256(`n`) by the EVM key, base64 of 65 bytes `r‖s‖recId`. Not needed for a SOL-only terminal |

Size limit: an Android GATT read stops at 512 bytes, and the app enforces **≤ 480 bytes** of serialized JSON (`BLE_MAX_PAYLOAD_BYTES`). A SOL-only payload like the one above is about 230 bytes.

Legacy v1 (still accepted by the sender): `{"address","displayName","chainId","sessionId","nonce","expiresAt"(ISO),"signature"}`. Don't use it for new work.

### 1.4 Signature and trust rules

How the sender classifies each advertised address (`classifyBleAccounts()` in `bleSignatureVerify.ts`):

- **SOL:** `nacl.sign.detached.verify(utf8(n), bs58decode(s), bs58decode(a.SOL))`.
  - valid → `verified` → the sender pays straight away, no extra prompt.
  - `s` missing → `unsigned` → the sender shows a "confirm who you're paying" screen with the address (`confirm_unsigned` state) and pays only if the customer accepts.
  - `s` present but wrong → `invalid` → the sender aborts with "Could not verify the receiver's identity. Nothing was sent."
- **EVM:** recover the public key from `p` over sha256(utf8(`n`)). Derived EVM address matches → `verified`, no `p` → `unsigned`, mismatch → `invalid`.
- If **every** account is `invalid`, the session is rejected outright.

The signed message is the **raw UTF-8 bytes of the nonce string**, with no prefix and no hashing for ed25519. Example (Node, tweetnacl + bs58):

```ts
const nonce = crypto.randomUUID();
const s = bs58.encode(nacl.sign.detached(Buffer.from(nonce, 'utf8'), merchantKeypair.secretKey));
```

**What this proves:** only that whoever produced the session controls the key for `a.SOL`. The signature does **not** cover the amount, the display name or the expiry.

### 1.5 Sender sequence (customer phone)

1. The customer opens Tap to Pay and enters an amount and token on `Send` (`isTapToPay: true`). **The amount comes from the customer.**
2. `TapToPayConfirmScreen` checks Bluetooth and runs biometric/PIN, then goes to `BLEScan`.
3. `BleScanner.start()`: scans for the service UUID, `allowDuplicates: true`, `ScanMode.LowLatency`. Android asks for `BLUETOOTH_SCAN` + `BLUETOOTH_CONNECT` (API 31+) or fine location (older).
4. **Proximity gate:** ignore any advertisement with RSSI below **−50 dBm** (`BLE_RSSI_CLOSE_THRESHOLD_DBM`). The first one at or above −50 triggers a connection immediately. Touching phones read about −30 to −45.
5. Stop scanning → `connectToDevice(autoConnect:false)` → Android only: request high connection priority and **MTU 517** → discover services → **read** the session characteristic.
6. Parse → reject if expired (`e` < now), already-used session id, or all accounts invalid → mark the session id as used.
7. Pick the account for the chain of the token being sent: Solana tokens → `SOL`. EVM chains → `EVM`. BTC → `BTC`, and so on. If missing: "<name> can't receive <chain> over Bluetooth".
8. `verified` → pay. `unsigned` → customer confirms first. `invalid` → abort.
9. **Write** `{"transferStatus":"processing", ...}` to the characteristic.
10. Run the normal send (`executeTransfer` from `useSendTransferExecution.ts`): the DYNK backend builds the transaction, the phone signs and submits it. One automatic retry if it failed *before signing* on a network error.
11. Success → **write** `{"transferStatus":"confirmed","txSignature":"...", ...}`. Failure → **write** `{"transferStatus":"failed", ...}`. Then disconnect.
12. Overall scan timeout: **25 s**, then "Phones didn't read properly".

### 1.6 Messages the sender writes to the receiver

Written with `writeCharacteristicWithResponseForDevice`, as UTF-8 JSON (base64 on the RN side). All fields are strings unless noted:

```json
{
  "transferStatus": "processing" | "confirmed" | "failed",
  "txSignature": "5h3k...",        // only on confirmed
  "amount": "432.18",              // token units, what the sender intended to send
  "symbol": "DYNK",
  "chainId": "solana-mainnet",
  "recipientAddress": "9xQe...",   // address the sender paid
  "senderAddress": "7Abc...",
  "fiatAmount": "10.00",           // optional
  "fiatAmountUsd": 6.52,           // optional, number
  "currencyCode": "AUD",           // optional
  "networkFee": "~$0.01",          // optional, display text
  "networkFeeSymbol": ""
}
```

- `confirmed` means **"submitted, signature known"**, not "finalised on chain". The receiver must verify (§1.7).
- Any of these writes can fail silently on the sender side (it logs and carries on). The terminal must not depend on getting `confirmed`. See §2.4 for the fallback.
- **Long writes:** the payload is about 250–400 bytes. Android senders negotiate MTU 517, so it arrives in one write. **iPhone senders don't request a big MTU, so iOS may split the write into a prepared ("long") write.** The current Android receiver module doesn't reassemble prepared writes. The Dynkle terminal **must** (§2.2).

### 1.7 What the receiver phone verifies TODAY
`verifyPayment()` in `BLEReceiveScreen.tsx` + `confirmIncomingTransfer()` in `src/services/ble/verifyIncomingTransfer.ts`:
- It needs `txSignature`, `amount > 0`, `symbol`, and its own address for `chainId`. A claimed `recipientAddress` that isn't its own → "couldn't match this payment".
- It polls the chain every 2 s for up to 60 s. Solana: `getParsedTransaction(sig, {commitment:'confirmed'})`, `meta.err` null, and **either the SOL balance or any token balance owned by its address went up.**
- **It does not check the amount or the mint.** That's acceptable person-to-person, but not for a merchant. Dynkle must check both (§2.4).

### 1.8 Constants

| Constant | Value | File |
|---|---|---|
| RSSI threshold | −50 dBm | `bleTypes.ts` |
| Session TTL (receiver) | 60 s | `bleTypes.ts`, `bleAdvertiser.ts` |
| Max payload | 480 bytes | `bleTypes.ts` |
| Sender scan timeout | 25 s | `BLEScanScreen.tsx` |
| Sender MTU request (Android) | 517 | `bleScanner.ts` |
| Receiver verify poll | every 2 s, 60 s max | `verifyIncomingTransfer.ts` |
| Signer timeout (receiver signing) | 8 s | `bleChainSigners.ts` |

---

## 2. Phase 1: making the Dynkle terminal a Tap to Pay receiver (no app change)

The FP9840 is an Android 14 POS with BT 5.0, so it can run the same GATT server as the DYNK receiver module. iPhones and Android phones both connect to it as centrals, so iPhones are fully supported, unlike NFC card emulation.

### 2.1 End-to-end flow

```
Merchant (terminal)                 Dynkle backend                     Customer (DYNK app)
-------------------                 --------------                     -------------------
enter price, press Charge  ───────► create charge {id, amountRaw,
                                     mint, recipient, expiresAt}
                           ◄─────── session {n, e, s, a.SOL, d}
start advertising (§2.2)
show "Tap to pay  A$10.00 = 432.18 DYNK"
                                                                       Tap to Pay → types 432.18 DYNK
                                                                       → biometric → holds phone to terminal
onCentralConnected / read  ◄──────────────────────────────────────────  GATT read session
                           ◄──────────────────────────────────────────  write {processing}
show "Paying…"
                                                                        DYNK backend builds tx, phone signs, submits
                           ◄──────────────────────────────────────────  write {confirmed, txSignature}
POST /charges/:id/claim-signature ─► verify on chain (§2.4)
                           ◄─────── PAID / WRONG_AMOUNT / NOT_FOUND
show result, stop advertising
```

The terminal must tell the merchant to **tell the customer the exact DYNK amount** (or show it big on screen), because TODAY the customer types it. Phase 2 (§3) removes this step.

### 2.2 Terminal GATT server: requirements

Port `modules/dynk-ble-peripheral/android/.../DynkBlePeripheralModule.kt`. It's about 150 lines and the protocol must match byte for byte. Required changes over the app's version are marked ★.

1. Permissions: `BLUETOOTH_ADVERTISE`, `BLUETOOTH_CONNECT` (runtime on Android 12+).
2. `openGattServer`. Wait for `onServiceAdded` before advertising (★: the app module doesn't wait, which can race).
3. One primary service `7a1e8f10-...9c10` with one characteristic `7a1e8f11-...9c10`, `PROPERTY_READ | PROPERTY_WRITE`, `PERMISSION_READ | PERMISSION_WRITE`.
4. Advertise: connectable, low latency, **TX power: start at `ADVERTISE_TX_POWER_HIGH` like the app, then tune down on the real device** so only a phone held at the terminal crosses −50 dBm at the phone. The phone enforces −50 dBm on what *it* receives, so a weaker terminal transmitter shrinks the tap distance. Measure on the FP9840 and pick the level where about 3 cm triggers and 30 cm doesn't.
5. **Read requests:** answer with `value.copyOfRange(offset, size)` so long reads with an offset work.
6. ★ **Write requests:** support prepared writes. If `preparedWrite == true`, buffer `value` at `offset` per device, reply `GATT_SUCCESS` echoing the value, and only parse when `onExecuteWrite(execute=true)` arrives. If `preparedWrite == false`, parse right away. The bytes are plain UTF-8 JSON (the base64 only exists inside the React Native layer).
7. ★ **Session rotation:** before `e` passes, fetch a fresh session from the backend and swap the characteristic value. While a charge is open, keep a session with at least 15 s left. Never serve an expired session, because the sender will reject it.
8. ★ **One customer per charge:** once a central has read *and* written `processing`, stop advertising for this charge (or serve a session that is marked busy) so a second phone can't start paying the same charge.
9. ★ Handle `STATE_DISCONNECTED` (not handled in the app module) to reset UI state if the phone walks away before `confirmed`.
10. Close the GATT server and stop advertising when the charge ends (paid, cancelled or expired).

Kotlin outline:

```kotlin
val SERVICE = UUID.fromString("7a1e8f10-7a2c-4b7e-9b7a-1f6a2e6b9c10")
val SESSION = UUID.fromString("7a1e8f11-7a2c-4b7e-9b7a-1f6a2e6b9c10")
private val pending = mutableMapOf<String, java.io.ByteArrayOutputStream>()

override fun onCharacteristicReadRequest(d: BluetoothDevice, id: Int, offset: Int, c: BluetoothGattCharacteristic) {
  val v = sessionBytes                       // current JSON bytes, <= 480
  val chunk = if (offset < v.size) v.copyOfRange(offset, v.size) else ByteArray(0)
  server.sendResponse(d, id, BluetoothGatt.GATT_SUCCESS, offset, chunk)
  onSessionRead(d.address)
}

override fun onCharacteristicWriteRequest(d: BluetoothDevice, id: Int, c: BluetoothGattCharacteristic,
    prepared: Boolean, needResp: Boolean, offset: Int, value: ByteArray) {
  if (prepared) {
    pending.getOrPut(d.address) { java.io.ByteArrayOutputStream() }.write(value)   // offsets arrive in order
  } else {
    handleSenderMessage(d.address, String(value, Charsets.UTF_8))
  }
  if (needResp) server.sendResponse(d, id, BluetoothGatt.GATT_SUCCESS, offset, value)
}

override fun onExecuteWrite(d: BluetoothDevice, id: Int, execute: Boolean) {
  val buf = pending.remove(d.address)
  if (execute && buf != null) handleSenderMessage(d.address, buf.toString(Charsets.UTF_8.name()))
  server.sendResponse(d, id, BluetoothGatt.GATT_SUCCESS, 0, null)
}
```

`handleSenderMessage` parses the JSON from §1.6. `processing` → show "Paying…". `confirmed` → send `txSignature` to the backend for verification. `failed` → show "Payment didn't go through" and keep the charge open for a retry with a fresh session. Unparseable → ignore it and rely on the backend's chain watcher (§2.4).

### 2.3 Session creation and signing (Dynkle backend)

Per charge, and again per rotation:
```
n = uuidv4()                         // string, also the session id; never reuse
e = now_ms + 60_000                  // the app's own TTL; may be longer, keep it short
d = merchant display name (<= 24 chars)
a = { "SOL": merchantReceivingAddress }
s = bs58( ed25519_sign( utf8(n), key_of(merchantReceivingAddress) ) )
```
Serialize with no extra whitespace and check it's ≤ 480 bytes.

**Who holds the key that signs `s`?** The signature must come from the key of the address being paid, otherwise the sender marks it `invalid` and aborts. Pick one:
- **(i) Sign on the backend** with the merchant settlement wallet key (only if Dynkle custodies or controls that wallet). Best UX: `verified`, no prompt. The key never touches the terminal.
- **(ii) Per-terminal receiving wallet** whose key sits in the terminal's secure storage. Sign locally, sweep funds to the merchant wallet on a schedule. `verified` UX, but a hot key on a device in a shop.
- **(iii) Don't sign** (omit `s`). Works with any wallet, including a merchant's self-custody one, but every customer sees the "confirm who you're paying" screen with a raw address. Worst UX, and phishing-prone.

Never return a session signed for an address other than the one the charge expects to be paid on.

### 2.4 Verification (Dynkle backend): the terminal never decides "Paid" by itself

Run this when the terminal posts a `txSignature`, **and** in parallel with a chain watcher (step 0), so a lost or garbled BLE write doesn't lose a payment.

**Which DYNK token.** Check payments against the DYNK mint that the customers' app build uses. In `src/config/environment.ts` every preset (including `prod`) defaults `dynkMintAddress` to the devnet mint `8RscFZC7rooxRAaXGPomxwp5QqhrQMDRjvpx2qViEKoT` unless a build-time env var overrides it. The app always sends its own configured DYNK mint when the token is DYNK. Confirm the production mint with the DYNK team, and read its decimals from chain rather than assuming them.

**Charge record.** When the merchant creates a charge, store `{chargeId, recipient, mint, amountRaw, createdAt, expiresAt}`, where `amountRaw` = DYNK amount × 10^decimals as an integer. In phase 1 there is no on-chain reference, so **make `amountRaw` unique among open charges for the same recipient**. If two open charges would match, change the newer one by one unit of the last decimal place (e.g. `432.180001`). Without this, two tills charging the same price to the same wallet can't be told apart.

0. **Chain watcher.** Subscribe to the merchant's DYNK token account (`accountSubscribe` / `logsSubscribe` via Helius or similar) or poll `getSignaturesForAddress(merchantTokenAccount)`. Every new signature runs through steps 1–5, the same as one posted by the terminal.
1. `getParsedTransaction(sig, {commitment:'confirmed', maxSupportedTransactionVersion:0})`. Retry every 1–2 s, up to about 60 s.
2. `meta.err == null`, otherwise FAILED.
3. Find the `postTokenBalances` entry with `owner == charge.recipient && mint == charge.mint`. Delta vs `preTokenBalances` (same `accountIndex`, 0 if absent) **== charge.amountRaw** (TODAY the customer types the amount, so decide the policy for `>` and `<`: suggest *under → WRONG_AMOUNT, show the shortfall; over → PAID, flag the excess*).
4. `blockTime` inside the charge window. The signature must not already be attached to another charge.
5. Mark the charge PAID and push it to the terminal (websocket or poll).

Don't trust `amount`, `recipientAddress` or `symbol` from the BLE write. They're the sender's claims and are only used for display while verifying.

### 2.5 Terminal UX states (suggested)
`idle` → `waiting_for_tap` (shows price in fiat + DYNK amount + "Open DYNK → Tap to Pay") → `phone_connected` (on read) → `paying` (on `processing`) → `verifying` (on `confirmed`) → `paid` / `wrong_amount` / `failed` / `expired`. Keep the timeouts aligned with the app: the customer's phone gives up scanning after 25 s, and the charge window should be a few minutes with session rotation inside it.

### 2.6 Acceptance tests (phase 1)
- [ ] Android phone and iPhone each pay a DYNK charge; the terminal reaches `paid` from the BLE write.
- [ ] Same, with the BLE `confirmed` write blocked: the terminal still reaches `paid` via the chain watcher.
- [ ] iPhone sender: a write split into a prepared write is reassembled (log raw writes).
- [ ] Phone at 30 cm doesn't connect; phone at about 3 cm does (after TX tuning).
- [ ] A session older than `e` is rejected by the phone; the terminal rotates before that happens.
- [ ] A second phone can't start paying while the first is `paying`.
- [ ] A customer who types the wrong amount gets `wrong_amount`, not `paid`.
- [ ] A sender that pays the wrong token (e.g. SOL instead of DYNK) gets `wrong_amount` / not paid.

---

## 3. Phase 2 (PROPOSED app change): the terminal sets the amount over Bluetooth

Goal: the customer just opens Tap to Pay and taps. The terminal provides the amount and token, the app shows them locked, and the payment carries the charge reference.

### 3.1 Payload extension (backwards compatible)
Add optional fields to the v2 session. Old app versions ignore unknown keys and behave as in §1.

| Field | Meaning |
|---|---|
| `q` | Request object, present only for a merchant charge |
| `q.am` | Amount in token units, decimal string, e.g. `"432.18"` |
| `q.t` | Token symbol, e.g. `"DYNK"` |
| `q.ta` | Mint, omitted when `q.t == "DYNK"` (the app uses its own DYNK mint) |
| `q.c` | Chain id, default `solana-mainnet` |
| `q.r` | Charge reference: a base58 pubkey (Solana Pay reference, see §3.2 step 7) |
| `q.f` | Fiat display, e.g. `"AUD 10.00"`, display only |
| `q.s` | ed25519 signature by the `a.SOL` key over the canonical string `dynk-charge|v1|<n>|<e>|<a.SOL>|<q.c>|<q.t>|<q.ta>|<q.am>|<q.r>` (UTF-8, pipe-separated, in exactly this order; an absent field is an empty string, `e` as decimal ms), bs58-encoded |

Size check: the base SOL payload is about 230 bytes, plus `q` with `r` and `q.s` about 230 bytes, which is about 460. That fits under 480, but only just. Don't include `p`/`k`/EVM in a charge session, and keep `d` ≤ 16 chars.

### 3.2 App behaviour (spec for the DYNK app team)
1. **New entry:** let Tap to Pay start scanning **before** amount entry (e.g. Dashboard → Tap to Pay → "Pay a terminal" goes straight to the biometric/scan screen). Keep the existing amount-first path for person-to-person.
2. On read, if `q` is present: verify `q.s` against `a.SOL`. Invalid → abort like `SIG_INVALID`. Valid → stop and show a **review sheet** with the locked amount, token, fiat display and merchant name ("Pay Blackall St Cafe A$10.00 · 432.18 DYNK"). The customer confirms with one button, with no second biometric if they just did one on entry.
3. If the customer came through the amount-first path and `q` is present: use `q.am`, not the typed amount, and show the merchant amount on the review sheet.
4. Execute with `qrPaymentRequest: true`, `amountMode: 'fixed'`, and pass `q.r` through to the DYNK backend build call as `references: [q.r]` (needs the DYNK backend change in step 7 below). Put `charge_reference: q.r` in `paymentMetadata` as well.
5. Write-back: unchanged (§1.6), plus `"reference": q.r`.
6. Sessions **without** `q` keep today's behaviour exactly.
7. **DYNK backend:** `POST /api/user/solana/v2/build/send-spl` and `.../send-sol` accept `references: string[]` and append each one to the transfer instruction as a read-only, non-signer account key (standard Solana Pay behaviour). The memo/note isn't written on chain today, so this is the only way for Dynkle to tie a transaction to a charge without amount matching.

Code touch points: `bleTypes.ts` (types), `bleSessionParser.ts` (parse `q`), `bleSignatureVerify.ts` (verify `q.s`), `BLEScanScreen.tsx` (use `q.am`, review sheet, no-amount entry), `SendScreen.tsx` / navigation (new entry), `useSendTransferExecution.ts` + `solanaV2.ts` (`references`), DYNK backend `build/send-spl`, `build/send-sol`.

### 3.3 Dynkle changes for phase 2
- Generate a reference keypair per charge and sign `q.s` the same way as `s` (§2.3).
- Detect by `getSignaturesForAddress(reference)` and keep the §2.4 checks (amount, mint, recipient, window).
- No amount-uniqueness hack is needed once the reference is supported.

---

## 4. Phase 3 (optional, later): phone signs, terminal submits

This is the flow raised on 8–9 Oct 2026: the customer's phone only signs, and the online terminal broadcasts, so the phone needs no internet. **It isn't in the app and needs significant app and backend work.** Outline only:

- The terminal (via Dynkle backend) builds the transfer with **Dynkle as fee payer** and the customer as token authority, using a recent blockhash.
- Transport: a Solana transaction is up to 1232 bytes (about 1644 base64), so it won't fit in the 480-byte read. Add a second characteristic with a chunked protocol (header `{len, sha256}` then chunks, or notify-based) for terminal → phone, and a write for phone → terminal carrying the 64-byte signature.
- The phone must decode the transaction and **only** sign if it's a single SPL `TransferChecked` of the shown amount and mint to the shown recipient, with no other instructions that touch the customer's accounts. Today the app only signs transactions built by DYNK's own backend, so this is a new trust boundary and needs a security review.
- The phone has no network, so it can't fetch prices or balances. Show amounts from the signed session, and let the terminal handle "insufficient funds" from the simulation result.
- The terminal adds the fee-payer signature, broadcasts, and confirms. The blockhash expires after about 60–90 s, so the whole tap must finish quickly.
- Also needed: an offline signer path for Web3Auth wallets (the signer session normally restores over the network) and a Tangem path.

Do phase 1 and 2 first. Phase 3 only makes sense if offline customers turn out to be a real problem.

---

## 5. Decisions needed from Simon
1. **Signing key for sessions** (§2.3 i / ii / iii). This depends on whether Dynkle holds the merchant's receiving wallet.
2. **Production DYNK mint** the shipped app uses (§2.4).
3. **Over/under payment policy** while customers type the amount (phase 1, §2.4 step 3).
4. Whether to fund the **app + DYNK backend change** for terminal-set amount and `reference` (§3) now, or after a phase 1 pilot.
5. **Charge window length** (suggest 3 min, with BLE sessions rotating every 45 s).

## 6. File index (app repo)

| Concern | File |
|---|---|
| BLE constants + types | `src/services/ble/bleTypes.ts` |
| Receiver advertise + session signing | `src/services/ble/bleAdvertiser.ts`, `bleChainSigners.ts`, `bleWirePayload.ts` |
| Native GATT server (port this) | `modules/dynk-ble-peripheral/android/src/main/java/expo/modules/dynkbleperipheral/DynkBlePeripheralModule.kt`, `modules/dynk-ble-peripheral/ios/DynkBlePeripheralModule.swift`, `modules/dynk-ble-peripheral/index.ts` |
| Sender scan / connect / read / write-back | `src/services/ble/bleScanner.ts` |
| Session parse + trust rules | `src/services/ble/bleSessionParser.ts`, `bleSignatureVerify.ts` |
| Sender UI + payment | `src/screens/send/BLEScanScreen.tsx`, `TapToPayConfirmScreen.tsx`, `SendScreen.tsx` (`isTapToPay`) |
| Send execution + payment metadata | `src/screens/send/useSendTransferExecution.ts` |
| Solana gasless build/sign/submit | `src/services/web3/solanaV2.ts` (`sendTokenV2`, `sendSolV2`, `executeV2Action`) |
| Fees (DYNK ~1¢, other chains +1%) | `src/lib/multichainSendPlatformFee.ts` |
| DYNK mint / env | `src/config/environment.ts` |
| Receiver UI + on-chain verification | `src/screens/receive/BLEReceiveScreen.tsx`, `src/services/ble/verifyIncomingTransfer.ts`, `incomingTransferChecks.ts` |