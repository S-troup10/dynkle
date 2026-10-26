import { useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { BackHeader } from '@/components/Header';
import { Icon } from '@/components/Icon';
import { List, Row, Screen, SectionLabel, StatusText } from '@/components/ui';
import { APP_VERSION } from '@/lib/config';
import { bluetooth, nfc, wifi } from '@/native/hardware';
import { useSession } from '@/state/session';
import { useOffline, useUi } from '@/state/ui';
import { colors, fonts, radius } from '@/theme';

function notify(title: string, msg: string) {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${msg}`);
  else Alert.alert(title, msg);
}

export default function Settings() {
  const profile = useSession((s) => s.profile);
  const net = useUi((s) => s);
  const { offline } = useOffline();
  const [sound, setSound] = useState(profile?.settings.soundEnabled ?? true);
  if (!profile) return null;
  const { merchant, till, settings } = profile;
  const network = !net.netConnected
    ? 'Not connected'
    : net.netType === 'cellular'
      ? 'Mobile data'
      : (net.wifiName ?? wifi.currentSsid() ?? 'Connected');

  return (
    <Screen>
      <BackHeader title="Settings" />
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.hero}>
          <Text style={s.heroTitle}>
            {merchant.name} · {till.name}
          </Text>
          <Text style={s.heroSub}>
            Serial {profile.serial} · App {APP_VERSION} · Firmware {profile.firmwareVersion}
          </Text>
        </View>

        <SectionLabel>BUSINESS</SectionLabel>
        <List>
          <Row label="Business name" value={merchant.legalName} />
          <Row label="ABN" value={merchant.abn} />
          <Row label="Address" value={merchant.address} />
          <Row label="Phone" value={merchant.phone} />
          <Row label="Email" value={merchant.email} />
          <Row label="Payout wallet" value={merchant.walletAddress} />
        </List>

        <SectionLabel>CONNECTION</SectionLabel>
        <List>
          <Row label="Network" value={network} chevron onPress={() => router.push('/settings/network')} testID="settings-network" />
          <Row label="Dashboard" valueNode={<StatusText state={offline ? 'unavailable' : 'ready'} />} />
          <Row label="Tap (NFC)" valueNode={<StatusText state={nfc.state()} />} />
          <Row label="Bluetooth" valueNode={<StatusText state={bluetooth.state()} />} />
        </List>

        <SectionLabel>TERMINAL</SectionLabel>
        <List>
          <Row label="Sound" value={sound ? 'On' : 'Off'} onPress={() => setSound((v) => !v)} />
          <Row label="Brightness" value="Auto" />
          <Row label="Tips" value={`${settings.tipsEnabled ? 'On' : 'Off'} · set in dashboard`} />
          <Row
            label="Software update"
            value="Up to date"
            chevron
            onPress={() => notify('Software update', `Dynkle ${APP_VERSION} is the latest version.`)}
          />
          <Row
            label="Help and support"
            chevron
            onPress={() => notify('Help and support', 'Call 1300 DYNKLE or email support@dynk.io. Quote your serial number.')}
          />
        </List>

        <Pressable
          onPress={() => router.push('/settings/admin-code')}
          style={({ pressed }) => [s.admin, pressed && { opacity: 0.8 }]}
          testID="admin-settings"
        >
          <View style={s.adminIcon}>
            <Icon name="lock" size={20} color={colors.orange} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.adminTitle}>Admin settings</Text>
            <Text style={s.adminSub}>Unpair, restart, reset, menu items. Needs admin code.</Text>
          </View>
          <Icon name="chevron" size={18} />
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 30 },
  hero: { backgroundColor: colors.ink, borderRadius: radius.card, padding: 18, gap: 6 },
  heroTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.white },
  heroSub: { fontFamily: fonts.body, fontSize: 13, color: 'rgba(255,255,255,0.75)' },
  admin: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 24,
    padding: 16,
    borderRadius: radius.card,
    backgroundColor: colors.orangeTint,
    borderWidth: 1,
    borderColor: colors.orangeGlow,
  },
  adminIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  adminTitle: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.ink },
  adminSub: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, marginTop: 2 },
});
