// Makes the terminal app the device's home screen and lets lock task mode pin it.
// Combined with `dpm set-device-owner` (see modules/dynkle-kiosk/README.md) the
// terminal boots straight into Dynkle and customers can't leave it.
const { withAndroidManifest, AndroidConfig } = require('expo/config-plugins');

module.exports = function withKioskLauncher(config) {
  return withAndroidManifest(config, (cfg) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(cfg.modResults);
    activity.$['android:lockTaskMode'] = 'if_whitelisted';
    activity.$['android:screenOrientation'] = 'portrait';

    const filters = (activity['intent-filter'] ??= []);
    const isHome = (f) => (f.category ?? []).some((c) => c.$['android:name'] === 'android.intent.category.HOME');
    if (!filters.some(isHome)) {
      filters.push({
        action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
        category: [
          { $: { 'android:name': 'android.intent.category.HOME' } },
          { $: { 'android:name': 'android.intent.category.DEFAULT' } },
        ],
      });
    }
    return cfg;
  });
};
