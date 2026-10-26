import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { BackHeader } from '@/components/Header';
import { NetworkPicker, type NetworkSelection } from '@/components/NetworkPicker';
import { Button, Screen, T } from '@/components/ui';
import { wifi } from '@/native/hardware';
import { colors } from '@/theme';

export default function SettingsNetwork() {
  const [sel, setSel] = useState<NetworkSelection>({ mode: 'wifi', network: null, password: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const connect = async () => {
    if (sel.mode !== 'wifi' || !sel.network || sel.network.connected) return router.back();
    setBusy(true);
    const ok = await wifi.connect(sel.network.ssid, sel.network.secured ? sel.password : null).catch(() => false);
    setBusy(false);
    if (ok) router.back();
    else setMsg(`Couldn't join ${sel.network.ssid}. Check the password and try again.`);
  };

  return (
    <Screen>
      <BackHeader title="Network" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }} keyboardShouldPersistTaps="handled">
        <NetworkPicker value={sel} onChange={setSel} />
        {msg ? <T style={{ color: colors.red, marginTop: 12 }}>{msg}</T> : null}
      </ScrollView>
      <View style={{ padding: 20 }}>
        <Button title="Connect" loading={busy} onPress={connect} />
      </View>
    </Screen>
  );
}
