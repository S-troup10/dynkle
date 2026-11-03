# dynkle-nfc

Emulates an NFC Forum Type 4 tag so a customer can pay by tapping their phone on the terminal.

## How it works

`DynkleNfcModule` exposes two calls to JS:

- `getState()` — `"ready" | "off" | "unsupported"`, drives the Tap chip on the armed screen.
- `setPayload(uri)` — arms (or disarms, with `null`) the tag with the payment link for the
  current charge.

The actual tag is served by `DynkleHceService`, an Android `HostApduService` registered for
Host Card Emulation. It answers a NDEF SELECT/READ BINARY sequence exactly like a passive NFC
sticker holding one URI record, built from the armed payload in `NdefPayload`. While no charge
is armed (`NdefPayload.ndefFile == null`), the NDEF application SELECT fails, so idle terminals
don't pop a link on phones that happen to be nearby.

The service is declared in `AndroidManifest.xml` with `BIND_NFC_SERVICE` and the
`HOST_APDU_SERVICE` intent filter; the AID list lives in `res/xml/dynkle_apduservice.xml`
(referenced from the manifest's `meta-data`).

## Requires

- `android.permission.NFC`
- `android.hardware.nfc` / `android.hardware.nfc.hce` (both optional features — the module
  reports `"unsupported"` when absent, e.g. on some tablets/emulators)

## Usage from JS

See `src/native/hardware.ts`'s `nfc` wrapper — `nfc.arm(uri)` is called when a charge is armed
and `nfc.arm(null)` when it ends (paid, failed, expired, cancelled). On web/Expo Go, where the
native module isn't compiled in, this falls back to a simulated `"ready"` state.
