import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Icon } from '@/components/Icon';
import { ProgressBar } from '@/components/Payment';
import { Halo, Screen } from '@/components/ui';
import { useUi } from '@/state/ui';
import { colors, fonts } from '@/theme';

/** Shown while the terminal installs an update pushed from the dashboard. */
export default function Update() {
  const version = useUi((s) => s.updateVersion) ?? '';
  const [pct, setPct] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setPct((p) => Math.min(100, p + 4)), 160);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (pct >= 100) {
      const t = setTimeout(() => {
        useUi.getState().setUpdate(null);
        if (router.canGoBack()) router.back();
        else router.replace('/keypad');
      }, 600);
      return () => clearTimeout(t);
    }
  }, [pct]);

  return (
    <Screen background="dark" glow="center">
      <View style={s.body}>
        <Halo color="rgba(255,255,255,0.08)" size={96}>
          <Icon name="download" size={36} color={colors.orange} strokeWidth={2.4} />
        </Halo>
        <Text style={s.title}>Updating</Text>
        <Text style={s.copy}>Don’t turn off the terminal. It restarts by itself and payments resume when it’s done.</Text>
        <View style={{ alignSelf: 'stretch', gap: 10, marginTop: 24 }}>
          <ProgressBar pct={pct} dark />
          <View style={s.row}>
            <Text style={s.small}>Installing version {version}</Text>
            <Text style={s.pct}>{pct}%</Text>
          </View>
        </View>
      </View>
      <Text style={s.brand}>DYNKLE</Text>
    </Screen>
  );
}

const s = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, gap: 16 },
  title: { fontFamily: fonts.display, fontSize: 30, color: colors.white, marginTop: 12 },
  copy: { fontFamily: fonts.body, fontSize: 15, lineHeight: 23, color: 'rgba(255,255,255,0.75)', textAlign: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  small: { fontFamily: fonts.body, fontSize: 13, color: 'rgba(255,255,255,0.75)' },
  pct: { fontFamily: fonts.display, fontSize: 13, color: colors.white },
  brand: { fontFamily: fonts.display, fontSize: 16, letterSpacing: 3, color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginBottom: 24 },
});
