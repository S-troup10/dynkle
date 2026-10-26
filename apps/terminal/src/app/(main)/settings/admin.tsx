import { Alert, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { BackHeader } from '@/components/Header';
import { Icon } from '@/components/Icon';
import { List, Row, Screen, SectionLabel, T } from '@/components/ui';
import { touchAdmin, useAdminGuard } from '@/hooks/useAdmin';
import { formatCountdown } from '@/lib/format';
import { storage } from '@/lib/storage';
import { kiosk, simulatedHardware, wifi, nfc } from '@/native/hardware';
import { useSession } from '@/state/session';
import { colors, fonts } from '@/theme';

function confirm(title: string, msg: string, action: string, onYes: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${msg}`)) onYes();
    return;
  }
  Alert.alert(title, msg, [
    { text: 'Cancel', style: 'cancel' },
    { text: action, style: 'destructive', onPress: onYes },
  ]);
}

export default function Admin() {
  const left = useAdminGuard();
  const merchant = useSession((s) => s.profile?.merchant.name);
  const act = (fn: () => void) => () => {
    touchAdmin();
    fn();
  };

  return (
    <Screen>
      <BackHeader
        title="Admin"
        onBack={() => router.dismissTo('/settings')}
        right={
          <View style={s.lock}>
            <Icon name="unlock" size={14} color={colors.orangeDeep} strokeWidth={2.4} />
            <Text style={s.lockText}>Locks in {formatCountdown(left)}</Text>
          </View>
        }
      />
      <ScrollView contentContainerStyle={s.content}>
        <SectionLabel>TERMINAL</SectionLabel>
        <List>
          <Row icon="restart" label="Restart terminal" sub="Takes about 30 seconds" chevron onPress={act(() => kiosk.restart())} />
          <Row
            icon="download"
            label="Send logs to support"
            sub="Helps us fix problems faster"
            chevron
            onPress={act(() => confirm('Logs sent', 'Support will be in touch if they need anything else.', 'OK', () => undefined))}
          />
          <Row
            icon="wifi"
            label="Forget saved networks"
            sub="Clears WiFi passwords"
            chevron
            onPress={act(() => confirm('Forget saved networks?', 'The terminal will stay on its current connection until it restarts.', 'Forget', () => wifi.forgetAll()))}
          />
        </List>

        <SectionLabel>MENU</SectionLabel>
        <List>
          <Row icon="items" label="Manage items" sub="Add or edit categories, items and sizes" chevron onPress={act(() => router.push('/settings/items'))} testID="manage-items" />
        </List>

        <SectionLabel>DEVELOPER</SectionLabel>
        <List>
          <Row icon="server" label="Dashboard server" sub={useSession.getState().apiUrl} chevron onPress={act(() => router.push('/settings/server'))} />
          {kiosk.available ? (
            <Row
              icon="unlock"
              label="Exit kiosk mode"
              sub={kiosk.isDeviceOwner() ? 'Unpins the app until the next restart' : 'Not set as device owner'}
              chevron
              onPress={act(() => kiosk.stop())}
            />
          ) : null}
          {simulatedHardware ? (
            <Row
              icon="tapOff"
              label="Simulate tap failure"
              sub={`NFC reader is ${nfc.state() === 'ready' ? 'ready' : 'unavailable'} (preview only)`}
              chevron
              onPress={act(() => nfc.simulate(nfc.state() === 'ready' ? 'unsupported' : 'ready'))}
            />
          ) : null}
        </List>

        <SectionLabel>DANGER ZONE</SectionLabel>
        <List>
          <Row
            icon="unlink"
            iconTone="red"
            danger
            label="Unpair from dashboard"
            sub={`Disconnect from ${merchant ?? 'the business'}`}
            chevron
            onPress={act(() => router.push('/settings/unpair'))}
            testID="unpair"
          />
          <Row
            icon="trash"
            iconTone="red"
            danger
            label="Factory reset"
            sub="Wipes everything on this terminal"
            chevron
            onPress={act(() =>
              confirm('Factory reset?', 'This wipes the pairing, saved networks and settings on this terminal.', 'Reset', async () => {
                await storage.set('dynkle.apiUrl', null);
                await wifi.forgetAll();
                useSession.getState().forget();
                setTimeout(() => router.replace('/welcome'), 0);
              }),
            )}
          />
        </List>
        <T v="small" style={{ textAlign: 'center', marginTop: 24 }}>
          Till name, tips and the admin code are changed from the merchant dashboard.
        </T>
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 30 },
  lock: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.orangeTint, borderRadius: 999, paddingHorizontal: 12, height: 30 },
  lockText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.orangeDeep },
});
