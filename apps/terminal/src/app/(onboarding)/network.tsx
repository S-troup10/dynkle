import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { BackHeader } from '@/components/Header';
import { NetworkPicker, type NetworkSelection } from '@/components/NetworkPicker';
import { Button, Headline, Screen, T } from '@/components/ui';
import { wifi } from '@/native/hardware';

export default function Network() {
  const [sel, setSel] = useState<NetworkSelection>({ mode: 'wifi', network: null, password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = async () => {
    setError(null);
    if (sel.mode === 'wifi' && sel.network && !sel.network.connected) {
      setBusy(true);
      const ok = await wifi.connect(sel.network.ssid, sel.network.secured ? sel.password : null).catch(() => false);
      setBusy(false);
      if (!ok) {
        setError(`Couldn't join ${sel.network.ssid}. Check the password and try again.`);
        return;
      }
    }
    router.push('/pair');
  };

  return (
    <Screen>
      <BackHeader eyebrow="SETUP · 1 OF 2" />
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Headline size={28}>Get online</Headline>
        <T style={{ marginTop: 8, marginBottom: 20 }}>The terminal needs internet to pair with your dashboard and confirm payments.</T>
        <NetworkPicker value={sel} onChange={setSel} />
        {error ? <T style={{ color: '#AD0D0D', marginTop: 12 }}>{error}</T> : null}
      </ScrollView>
      <View style={s.footer}>
        <Button
          title="Connect"
          trailingArrow
          loading={busy}
          disabled={sel.mode === 'wifi' && !!sel.network?.secured && !sel.network.connected && !sel.password}
          onPress={connect}
          testID="network-connect"
        />
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 24 },
  footer: { paddingHorizontal: 20, paddingBottom: 20 },
});
