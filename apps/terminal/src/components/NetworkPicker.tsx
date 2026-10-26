import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { wifi, type WifiNetwork } from '@/native/hardware';
import { useUi } from '@/state/ui';
import { colors, fonts, radius, shadows } from '@/theme';
import { Icon, type IconName } from './Icon';

const levelIcon = (level: number): IconName => (level >= 3 ? 'wifi' : level === 2 ? 'wifi2' : 'wifi1');

export interface NetworkSelection {
  mode: 'wifi' | 'mobile';
  network: WifiNetwork | null;
  password: string;
}

/** WiFi / Mobile data picker from the "Get online" setup screen. */
export function NetworkPicker({ value, onChange }: { value: NetworkSelection; onChange: (v: NetworkSelection) => void }) {
  const [networks, setNetworks] = useState<WifiNetwork[] | null>(null);
  const netType = useUi((s) => s.netType);
  const connected = useUi((s) => s.netConnected);

  useEffect(() => {
    let alive = true;
    wifi
      .scan()
      .then((list) => {
        if (!alive) return;
        setNetworks(list);
        if (!value.network) {
          const current = list.find((n) => n.connected) ?? list[0] ?? null;
          onChange({ ...value, network: current });
        }
      })
      .catch(() => alive && setNetworks([]));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={{ gap: 16 }}>
      <View style={s.segment}>
        {(['wifi', 'mobile'] as const).map((m) => {
          const on = value.mode === m;
          return (
            <Pressable
              key={m}
              onPress={() => onChange({ ...value, mode: m })}
              style={[s.segBtn, on && s.segOn]}
              testID={`net-${m}`}
            >
              <Icon name={m === 'wifi' ? 'wifi' : 'sim'} size={18} color={on ? colors.white : colors.ink} strokeWidth={2} />
              <Text style={[s.segText, on && { color: colors.white }]}>{m === 'wifi' ? 'WiFi' : 'Mobile data'}</Text>
            </Pressable>
          );
        })}
      </View>

      {value.mode === 'mobile' ? (
        <View style={s.card}>
          <View style={s.row}>
            <Icon name="sim" size={22} color={colors.orange} />
            <View style={{ flex: 1 }}>
              <Text style={s.name}>Built-in SIM</Text>
              <Text style={s.sub}>
                {connected && netType === 'cellular' ? 'Connected' : 'Uses the terminal’s SIM. Make sure it has an active data plan.'}
              </Text>
            </View>
          </View>
        </View>
      ) : networks === null ? (
        <View style={[s.card, { padding: 24 }]}>
          <ActivityIndicator color={colors.orange} />
        </View>
      ) : (
        <View style={s.card}>
          {networks.map((n, i) => {
            const selected = value.network?.ssid === n.ssid;
            return (
              <View key={n.ssid} style={[i > 0 && s.divider, selected && s.selected]}>
                <Pressable style={s.row} onPress={() => onChange({ ...value, network: n, password: '' })} testID={`wifi-${n.ssid}`}>
                  <Icon name={levelIcon(n.level)} size={22} color={selected ? colors.orange : colors.ink} />
                  <Text style={[s.name, { flex: 1 }]}>{n.ssid}</Text>
                  {selected ? (
                    <Text style={s.sub}>{n.connected ? 'Connected' : n.secured ? 'Secured' : 'Open'}</Text>
                  ) : n.secured ? (
                    <Icon name="lock" size={16} color={colors.muted} />
                  ) : null}
                </Pressable>
                {selected && n.secured && !n.connected ? (
                  <View style={{ paddingHorizontal: 18, paddingBottom: 18, gap: 6 }}>
                    <Text style={s.sub}>Password</Text>
                    <TextInput
                      value={value.password}
                      onChangeText={(password) => onChange({ ...value, password })}
                      secureTextEntry
                      autoFocus
                      placeholder="Network password"
                      placeholderTextColor={colors.muted}
                      style={s.input}
                      testID="wifi-password"
                    />
                  </View>
                ) : null}
              </View>
            );
          })}
          <Pressable style={[s.row, s.divider]} onPress={() => wifi.openPanel()}>
            <Icon name="plus" size={20} color={colors.ink} />
            <Text style={s.name}>Join another network</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  segment: { flexDirection: 'row', backgroundColor: colors.fill, borderRadius: radius.pill, padding: 4 },
  segBtn: { flex: 1, height: 44, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  segOn: { backgroundColor: colors.ink },
  segText: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.ink },
  card: { backgroundColor: colors.white, borderRadius: radius.card, overflow: 'hidden', ...shadows.card },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18, minHeight: 58 },
  divider: { borderTopWidth: 1, borderTopColor: colors.hairline },
  selected: { backgroundColor: colors.orangeTint },
  name: { fontFamily: fonts.bodyMedium, fontSize: 16, color: colors.ink },
  sub: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  input: {
    height: 50,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.orange,
    backgroundColor: colors.white,
    paddingHorizontal: 14,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.ink,
  },
});
