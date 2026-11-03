# dynkle-ble

The "Connect" path of a charge: a Bluetooth LE GATT server the DYNK app's Tap to Pay reads the
signed session from, and writes its status back to.

Ported from the DYNK app's own peripheral module so the protocol matches byte for byte — see
the class doc comment in `DynkleBleModule.kt` for the specific deltas (advertise-after-service,
reassembling iPhone's split "long" writes, locking to one phone per charge, TX power).

## How it works

`DynkleBleModule` exposes to JS:

- `getState()` — `"ready" | "off" | "unsupported"`, drives the Connect chip on the armed screen.
- `start(sessionJson, txPower)` — opens a GATT server with one service (`SERVICE_UUID`) and one
  characteristic (`SESSION_UUID`, read+write), and starts advertising once the service is
  actually added. Resolves when advertising is live; rejects with `E_BLE_OFF`,
  `E_BLE_NO_ADVERTISER`, `E_BLE_GATT`, `E_BLE_SERVICE` or `E_BLE_ADVERTISE` otherwise.
- `setSession(sessionJson)` — swaps the session a connected/future read will serve (session
  rotation), ahead of the old one expiring.
- `stopAdvertising()` — stops advertising but leaves the GATT server open.
- `stop()` — stops advertising and closes the GATT server; called when a charge ends (paid,
  failed, expired, cancelled) and on module teardown.
- Events: `onRead` (a phone read the session), `onMessage` (a phone wrote a status JSON, e.g.
  `{"transferStatus": "processing"}`), `onConnectionChange`, `onError`.

Once a phone's write reports `transferStatus: "processing"`, the module locks to that phone's
address and stops advertising — only it can read/write until the charge ends, so a second phone
can't race in on the same charge.

The `SERVICE_UUID`/`SESSION_UUID` constants must stay in sync with the DYNK app's
`src/services/ble/bleTypes.ts`.

## Requires

- `android.permission.BLUETOOTH_ADVERTISE`, `BLUETOOTH_CONNECT` (Android 12+, runtime
  permissions requested from JS before `start()`)
- `android.permission.BLUETOOTH`, `BLUETOOTH_ADMIN` (≤ API 30)
- `android.hardware.bluetooth_le` (optional feature)

## Usage from JS

See `src/native/hardware.ts` and `src/lib/tapToPay.ts` for how a charge's session JSON is
handed to `start`/`setSession`, and how the `onMessage` events drive the checkout state machine.
