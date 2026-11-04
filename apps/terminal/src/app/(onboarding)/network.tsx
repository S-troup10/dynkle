import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { BackHeader } from '@/components/Header';
import { Icon } from '@/components/Icon';
import { NetworkPicker, type NetworkSelection } from '@/components/NetworkPicker';
import { Button, Headline, Screen, T } from '@/components/ui';
import { wifi } from '@/native/hardware';
import { colors, compact, cs, fonts } from '@/theme';

/** How long the "Connected to X" confirmation stays up before auto-advancing to pairing. */
const ADVANCE_DELAY_MS = 900;

export default function Network() {
  const [sel, setSel] = useState<NetworkSelection>({ mode: 'wifi', network: null, password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectedSsid, setConnectedSsid] = useState<string | null>(null);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
  }, []);

  const advanceAfterConnected = (ssid: string | null) => {
    setConnectedSsid(ssid);
    advanceTimer.current = setTimeout(() => router.push('/pair'), ADVANCE_DELAY_MS);
  };

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
      // Show what it actually joined instead of jumping straight to the next screen.
      advanceAfterConnected(sel.network.ssid);
      return;
    }
    if (sel.mode === 'wifi' && sel.network?.connected) {
      advanceAfterConnected(sel.network.ssid);
      return;
    }
    router.push('/pair');
  };

  return (
    <Screen>
      <BackHeader eyebrow="SETUP · 1 OF 2" />
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Headline size={cs(28, 22)}>Get online</Headline>
        <T style={{ marginTop: cs(8, 4), marginBottom: cs(20, 12), fontSize: cs(15, 13), lineHeight: cs(22, 18) }}>
          The terminal needs internet to pair with your dashboard and confirm payments.
        </T>
        {connectedSsid ? (
          <View style={s.connected} testID="network-connected">
            <Icon name="check" size={20} color={colors.white} strokeWidth={2.6} />
            <Text style={s.connectedText}>Connected to {connectedSsid}</Text>
          </View>
        ) : (
          <NetworkPicker value={sel} onChange={setSel} />
        )}
        {error ? <T style={{ color: colors.red, marginTop: 12 }}>{error}</T> : null}
      </ScrollView>
      {connectedSsid ? null : (
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
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: compact ? 12 : 24 },
  footer: { paddingHorizontal: 20, paddingBottom: compact ? 12 : 20 },
  connected: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.green,
    borderRadius: 18,
    height: cs(58, 50),
    paddingHorizontal: 18,
  },
  connectedText: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.white },
});
