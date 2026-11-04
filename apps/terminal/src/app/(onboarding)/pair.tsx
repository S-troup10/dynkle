import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import type { TerminalProfile } from '@dynkle/shared';
import { api } from '@/api/client';
import { BackHeader } from '@/components/Header';
import { Icon } from '@/components/Icon';
import { Button, Card, Headline, Screen, T } from '@/components/ui';
import { APP_VERSION } from '@/lib/config';
import { wifi } from '@/native/hardware';
import { useSession } from '@/state/session';
import { useUi } from '@/state/ui';
import { colors, fonts, shadows } from '@/theme';

/**
 * The dashboard (Devices → Add terminal) mints the pairing code; this screen
 * is where the device enters it along with its own keypair (see
 * src/devices/deviceRoutes.js `POST /pair` on the backend).
 */
export default function Pair() {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingServer, setEditingServer] = useState(false);
  const apiUrl = useSession((s) => s.apiUrl);
  const [serverDraft, setServerDraft] = useState(apiUrl);

  const submit = async () => {
    const value = code.trim().toUpperCase();
    if (!value) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.pair(value, { model: 'FP9810', appVersion: APP_VERSION, osVersion: `${Platform.OS} ${Platform.Version}` });
      const profile: TerminalProfile = {
        merchant: {
          id: result.merchantId,
          name: result.merchantName,
          legalName: result.merchantName,
          abn: '',
          address: '',
          phone: '',
          email: '',
          walletAddress: '',
          timezone: 'Australia/Sydney',
        },
        till: { id: result.terminalId, name: result.counterLabel },
        settings: {
          tipsEnabled: true,
          tipPresets: [0, 10, 15, 20],
          currency: 'AUD',
          soundEnabled: true,
          priceLockSeconds: 90,
          dynkPerAud: 1,
        },
        serial: result.serialNumber ?? result.deviceId,
        appVersion: APP_VERSION,
        firmwareVersion: 'n/a',
      };
      useSession.getState().completePairing(result.token, profile, result.deviceId);
      router.replace('/paired');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <BackHeader eyebrow="SETUP · 2 OF 2" />
      <ScrollView contentContainerStyle={s.content}>
        <Headline size={28} accent="dashboard">
          Pair with your
        </Headline>
        <T style={{ marginTop: 8, marginBottom: 20 }}>
          In the merchant dashboard, go to Devices → Add terminal to get a pairing code, then enter it below.
        </T>

        <View style={s.codeCard}>
          <TextInput
            value={code}
            onChangeText={(v) => setCode(v.toUpperCase())}
            placeholder="XXXX-XXXX"
            placeholderTextColor={colors.muted}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={16}
            style={s.input}
            testID="pairing-code-input"
          />
          {error ? <Text style={[s.status, { color: colors.red }]}>{error}</Text> : null}
          <Button
            title={busy ? 'Pairing…' : 'Pair this terminal'}
            kind="dark"
            onPress={submit}
            disabled={busy || !code.trim()}
            style={{ height: 48 }}
          />
        </View>

        <View style={{ gap: 18, marginTop: 24 }}>
          <Step n={1}>Log in to the Dynkle merchant dashboard on a computer or phone.</Step>
          <Step n={2}>
            Go to <Text style={s.bold}>Devices</Text>, then <Text style={s.bold}>Add terminal</Text>.
          </Step>
          <Step n={3}>Type the code shown there into this screen.</Step>
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
              style={s.serverInput}
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
  codeCard: {
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderRadius: 24,
    padding: 14,
    gap: 14,
    borderWidth: 1,
    borderColor: colors.hairline,
    ...shadows.card,
  },
  input: {
    height: 56,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 16,
    fontFamily: fonts.displayHeavy,
    fontSize: 22,
    letterSpacing: 2,
    textAlign: 'center',
    color: colors.ink,
  },
  status: { fontFamily: fonts.body, fontSize: 14, color: colors.muted },
  stepNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
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
  serverInput: {
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
