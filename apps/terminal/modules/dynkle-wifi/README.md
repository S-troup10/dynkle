# dynkle-wifi

Network setup for the terminal's "Get online" screen, plus a Bluetooth adapter-state check.

## How it works

`DynkleWifiModule` exposes:

- `scan()` — triggers a WiFi scan and returns nearby networks (SSID, signal level 0-3, secured,
  whether it's the one currently connected), strongest and currently-connected first.
- `connect(ssid, password)` — joins a network. As **device owner**, the terminal configures and
  enables the network directly (`WifiConfiguration`/`addNetwork`, still allowed for device
  owners on every Android version). Otherwise it registers a `WifiNetworkSuggestion` and lets
  the system (or the merchant, in the WiFi panel) complete the connection.
- `currentSsid()` — the SSID currently associated, or `null`.
- `openPanel()` — opens the system WiFi settings panel, for when the merchant needs to finish
  connecting themselves.
- `forgetAll()` — clears network suggestions, and (as device owner) removes all configured
  networks, for factory-reset / "forget networks" flows.
- `bluetoothState()` — `"ready" | "off" | "unsupported"`, read from the Bluetooth adapter.
  Unrelated to WiFi, but bundled here since both live under Settings → Network.

## Requires

- `android.permission.ACCESS_WIFI_STATE`, `CHANGE_WIFI_STATE`, `ACCESS_NETWORK_STATE`
- Scan results need location before Android 13 (`ACCESS_FINE_LOCATION`) or nearby-devices from
  13 on (`NEARBY_WIFI_DEVICES`, `neverForLocation`) — requested from JS before scanning
  (`ensureScanPermission` in `src/native/hardware.ts`)
- `android.permission.BLUETOOTH` (≤ API 30) for `bluetoothState()`
- `android.hardware.wifi` / `android.hardware.bluetooth` (both optional features)

## Usage from JS

See `src/native/hardware.ts`'s `wifi` wrapper. On web/Expo Go, where the native module isn't
compiled in, `scan`/`currentSsid` fall back to a fixed simulated network list so the "Get
online" flow can still be previewed.
