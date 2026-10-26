import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import type { PairingCode } from '@dynkle/shared';
import { api } from '@/api/client';
import { BackHeader } from '@/components/Header';
import { Icon } from '@/components/Icon';
import { Button, Card, Headline, Screen, T } from '@/components/ui';
import { useCountdown } from '@/hooks/useCountdown';
import { formatCountdown } from '@/lib/format';
import { wifi } from '@/native/hardware';
import { useSession } from '@/state/session';
import { useUi } from '@/state/ui';
import { colors, fonts, shadows } from '@/theme';

export default function Pair() {
  const [code, setCode] = useState<PairingCode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingServer, setEditingServer] = useState(false);
  const apiUrl = useSession((s) => s.apiUrl);
  const [serverDraft, setServerDraft] = useState(apiUrl);
  const left = useCountdown(code?.expiresAt);
  const done = useRef(false);

  const [attempt, setAttempt] = useState(0);
  const retry = () => setAttempt((n) => n + 1);

  // Fetch a fresh code on mount, on retry, and when the dashboard address changes.
  useEffect(() => {
    let alive = true;
    api
      .createPairingCode()
      .then((fresh) => {
        if (!alive) return;
        setError(null);
        setCode(fresh);
      })
      .catch((e: Error) => {
        if (!alive) return;
        setCode(null);
        setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [attempt, apiUrl]);

  // Poll until the dashboard claims the code; swap in a new one when it lapses.
  useEffect(() => {
    if (!code) return;
    const t = setInterval(async () => {
      if (Date.parse(code.expiresAt) <= Date.now()) {
        clearInterval(t);
        retry();
        return;
      }
      try {
        const latest = await api.pollPairingCode(code.code);
        if (latest.status === 'claimed' && latest.token && !done.current) {
          done.current = true;
          clearInterval(t);
          const profile = await api.me(latest.token);
          useSession.getState().completePairing(latest.token, profile);
          router.replace('/paired');
        } else if (latest.status === 'expired') {
          clearInterval(t);
          retry();
        }
      } catch {
        // Keep polling; a blip shouldn't throw the code away.
      }
    }, 1500);
    return () => clearInterval(t);
  }, [code]);

  const chars = (code?.code ?? '······').split('');

  return (
    <Screen>
      <BackHeader eyebrow="SETUP · 2 OF 2" />
      <ScrollView contentContainerStyle={s.content}>
        <Headline size={28} accent="dashboard">
          Pair with your
        </Headline>
        <T style={{ marginTop: 8, marginBottom: 20 }}>Enter this code in the merchant dashboard to link this terminal to your business.</T>

        <View style={s.codeCard}>
          <View style={s.codeRow} testID="pairing-code" accessibilityLabel={code?.code}>
            {chars.map((c, i) => (
              <View key={i} style={[s.tile, i === 3 && { marginLeft: 12 }]}>
                <Text style={s.tileText}>{c}</Text>
              </View>
            ))}
          </View>
          {error ? (
            <View style={{ gap: 10, alignItems: 'center' }}>
              <Text style={[s.status, { color: colors.red }]}>{error}</Text>
              <Button title="Try again" kind="secondary" onPress={retry} style={{ height: 44, alignSelf: 'stretch' }} />
            </View>
          ) : (
            <View style={s.statusRow}>
              <View style={s.orangeDot} />
              <Text style={s.status}>
                Waiting for dashboard · new code in {formatCountdown(left)}
              </Text>
            </View>
          )}
        </View>

        <View style={{ gap: 18, marginTop: 24 }}>
          <Step n={1}>Log in to the Dynkle merchant dashboard on a computer or phone.</Step>
          <Step n={2}>
            Go to <Text style={s.bold}>Devices</Text>, then <Text style={s.bold}>Add terminal</Text>.
          </Step>
          <Step n={3}>Type in the code above and give this till a name.</Step>
        </View>

        <Pressable onPress={() => setEditingServer((v) => !v)} style={{ marginTop: 24 }} testID="server-toggle">
          <Text style={[s.status, { textAlign: 'center' }]}>Dashboard: {apiUrl}</Text>
        </Pressable>
        {editingServer ? (
          <Card style={{ marginTop: 10, gap: 10 }}>
            <TextInput
              value={serverDraft}
              onChangeText={setServerDraft}
              autoCapitalize="none"
              autoCorrect={false}
              style={s.input}
              testID="server-input"
            />
            <Button
              title="Use this dashboard"
              kind="dark"
              style={{ height: 48 }}
              onPress={() => {
                useSession.getState().setApiUrl(serverDraft.trim() || null);
                setEditingServer(false);
              }}
            />
          </Card>
        ) : null}
      </ScrollView>
      <ConnectionFooter />
    </Screen>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
      <View style={s.stepNum}>
        <Text style={s.stepNumText}>{n}</Text>
      </View>
      <Text style={s.stepText}>{children}</Text>
    </View>
  );
}

function ConnectionFooter() {
  const connected = useUi((s) => s.netConnected);
  const type = useUi((s) => s.netType);
  const ssid = useUi((s) => s.wifiName) ?? wifi.currentSsid();
  const label = !connected ? 'Not connected' : type === 'cellular' ? 'Connected to mobile data' : `Connected to ${ssid ?? 'WiFi'}`;
  return (
    <View style={s.footer}>
      <Icon name={connected ? 'wifi' : 'wifiOff'} size={20} color={connected ? colors.green : colors.red} />
      <Text style={[s.status, { flex: 1, color: colors.ink }]}>{label}</Text>
      <Pressable onPress={() => router.back()} hitSlop={10}>
        <Text style={s.change}>Change</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 24 },
  codeCard: { backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: 24, padding: 14, gap: 14, borderWidth: 1, borderColor: colors.hairline },
  codeRow: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  tile: {
    width: 46,
    height: 60,
    borderRadius: 14,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  tileText: { fontFamily: fonts.displayHeavy, fontSize: 26, color: colors.ink },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  orangeDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.orange, borderWidth: 2, borderColor: colors.orangeGlow },
  status: { fontFamily: fonts.body, fontSize: 14, color: colors.muted },
  stepNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  stepNumText: { fontFamily: fonts.display, fontSize: 11, color: colors.white },
  stepText: { flex: 1, fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.ink },
  bold: { fontFamily: fonts.bodySemi },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 20,
    marginBottom: 20,
    paddingHorizontal: 18,
    height: 60,
    borderRadius: 18,
    backgroundColor: colors.fill,
  },
  change: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.ink, textDecorationLine: 'underline' },
  input: {
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
  },
});
