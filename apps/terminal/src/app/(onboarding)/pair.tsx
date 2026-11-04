import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { TerminalProfile } from '@dynkle/shared';
import { api } from '@/api/client';
import { BackHeader } from '@/components/Header';
import { Icon } from '@/components/Icon';
import { Button, Card, Halo, Headline, Pulse, Screen, T } from '@/components/ui';
import { Spinner } from '@/components/Spinner';
import { APP_VERSION } from '@/lib/config';
import { wifi } from '@/native/hardware';
import { useSession } from '@/state/session';
import { useUi } from '@/state/ui';
import { colors, compact, cs, fonts, shadows } from '@/theme';

/**
 * The dashboard (Devices → Add terminal) mints the pairing code; this screen
 * is where the device enters it along with its own keypair (see
 * src/devices/deviceRoutes.js `POST /pair` on the backend).
 */
const CODE_LENGTH = 8;
const CODE_GROUP = 4;

export default function Pair() {
  const { scannedCode } = useLocalSearchParams<{ scannedCode?: string }>();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingServer, setEditingServer] = useState(false);
  const apiUrl = useSession((s) => s.apiUrl);
  const [serverDraft, setServerDraft] = useState(apiUrl);
  const inputRef = useRef<TextInput>(null);

  const doPair = async (value: string) => {
    if (!value.trim()) return;
    setCode(value);
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

  // Coming back from the QR scanner: pair immediately with what it read,
  // rather than making the merchant tap "Pair this terminal" again.
  useEffect(() => {
    // Pairing here is triggered by a navigation param changing, not a render loop risk.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (scannedCode) void doPair(scannedCode.slice(0, CODE_LENGTH));
  }, [scannedCode]);

  if (busy) {
    return (
      <Screen glow="center">
        <View style={s.pairingLoad}>
          <Pulse>
            <Halo color={colors.orangeGlow} size={140}>
              <Spinner size={72} stroke={5} />
            </Halo>
          </Pulse>
          <T v="eyebrow" style={{ marginTop: 20 }}>
            Pairing with your dashboard…
          </T>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <BackHeader eyebrow="SETUP · 2 OF 2" />
      <ScrollView contentContainerStyle={s.content}>
        <Headline size={cs(28, 24)} accent="dashboard">
          Pair with your
        </Headline>
        <T style={{ marginTop: cs(8, 6), marginBottom: cs(20, 16), fontSize: cs(15, 14), lineHeight: cs(22, 20) }}>
          Follow these steps on a computer or phone, then enter the code below.
        </T>

        <View style={{ gap: cs(18, 14) }}>
          <Step n={1}>Log in to the Dynkle merchant dashboard.</Step>
          <Step n={2}>
            Go to <Text style={s.bold}>Devices</Text>, then <Text style={s.bold}>Add terminal</Text>.
          </Step>
          <Step n={3}>Type the code shown there into this screen.</Step>
        </View>

        <View style={[s.codeCard, { marginTop: cs(24, 18) }]}>
          {/* The boxes are plain, normal-flow views — only the actual TextInput is a
              near-invisible 1x1 dot, so there's nothing that can show through behind
              them regardless of how opacity renders on a given Android build. */}
          <Pressable onPress={() => inputRef.current?.focus()} style={s.codeRow} testID="pairing-code-boxes">
            {Array.from({ length: CODE_LENGTH }, (_, i) => (
              <View key={i} style={[s.box, i === code.length && s.boxActive, i === CODE_GROUP && { marginLeft: 10 }]}>
                <Text style={s.boxText}>{code[i] ?? ''}</Text>
              </View>
            ))}
          </Pressable>
          <TextInput
            ref={inputRef}
            value={code}
            onChangeText={(v) => setCode(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH))}
            autoCapitalize="characters"
            autoCorrect={false}
            autoFocus
            caretHidden
            maxLength={CODE_LENGTH}
            style={s.hiddenInput}
            testID="pairing-code-input"
          />
          {error ? <Text style={[s.status, { color: colors.red, textAlign: 'center' }]}>{error}</Text> : null}
          <Button
            title={busy ? 'Pairing…' : 'Pair this terminal'}
            kind="dark"
            onPress={() => doPair(code)}
            disabled={busy || !code.trim()}
            style={{ height: 48 }}
          />
          <Button
            title="Scan QR code instead"
            kind="ghost"
            onPress={() => router.push('/scan')}
            disabled={busy}
            testID="scan-qr"
          />
        </View>

        <Pressable onPress={() => setEditingServer((v) => !v)} style={{ marginTop: cs(24, 16) }} testID="server-toggle">
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
  pairingLoad: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  codeCard: {
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderRadius: 24,
    padding: 14,
    gap: 14,
    borderWidth: 1,
    borderColor: colors.hairline,
    ...shadows.card,
  },
  // 1x1 and fully transparent: there's no native background left to possibly show
  // through, unlike an absolutely-positioned, merely-opacity-0 input would risk.
  hiddenInput: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  codeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 },
  box: {
    width: cs(32, 28),
    height: cs(46, 42),
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxActive: { borderColor: colors.orange },
  boxText: { fontFamily: fonts.displayHeavy, fontSize: cs(19, 17), color: colors.ink },
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
  stepText: { flex: 1, fontFamily: fonts.body, fontSize: cs(15, 14), lineHeight: cs(21, 19), color: colors.ink },
  bold: { fontFamily: fonts.bodySemi },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 20,
    marginBottom: compact ? 12 : 20,
    paddingHorizontal: 18,
    height: cs(60, 50),
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
