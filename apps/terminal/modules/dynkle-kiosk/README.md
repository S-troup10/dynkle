# dynkle-kiosk

Pins the Dynkle terminal app using Android lock task mode.

## Making the terminal a kiosk

Lock task mode works without prompts only when Dynkle is the **device owner**. On a
freshly reset terminal (no Google account added):

```sh
adb install app-release.apk
adb shell dpm set-device-owner io.dynk.dynkle.terminal/io.dynk.dynkle.kiosk.DynkleAdminReceiver
```

After that, the app:

- pins itself as soon as it's paired (`kiosk.start()` in `src/app/_layout.tsx`)
- hides the status and navigation bars, disables the status bar and keyguard
- is registered as a HOME launcher (`plugins/withKioskLauncher.js`) so it comes back after a reboot

Admin settings → **Exit kiosk mode** (behind the admin code) unpins it for maintenance.
To remove device owner during development: `adb shell dpm remove-active-admin io.dynk.dynkle.terminal/io.dynk.dynkle.kiosk.DynkleAdminReceiver`
(only works on debuggable builds), or factory reset the terminal.

Without device owner, `start()` falls back to screen pinning, which shows a one-time system prompt.
