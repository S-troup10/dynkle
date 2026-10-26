import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { BackHeader } from '@/components/Header';
import { Button, Card, Screen, T } from '@/components/ui';
import { useAdminGuard } from '@/hooks/useAdmin';
import { defaultApiUrl } from '@/lib/config';
import { useSession } from '@/state/session';
import { colors, fonts } from '@/theme';

/** Point the terminal at a different (mock) dashboard. Changing it keeps the pairing token. */
export default function Server() {
  useAdminGuard();
  const current = useSession((s) => s.apiUrl);
  const [url, setUrl] = useState(current);
  return (
    <Screen>
      <BackHeader title="Dashboard server" />
      <View style={{ paddingHorizontal: 20, gap: 14 }}>
        <T>The mock merchant dashboard this terminal talks to. On a real terminal use your computer’s LAN address, e.g. http://192.168.1.20:4000.</T>
        <Card>
          <TextInput value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} style={s.input} />
        </Card>
        <Button
          title="Save"
          onPress={() => {
            useSession.getState().setApiUrl(url.trim() || null);
            router.back();
          }}
        />
        <Button
          title="Reset to default"
          kind="secondary"
          onPress={() => {
            useSession.getState().setApiUrl(null);
            setUrl(defaultApiUrl());
          }}
        />
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  input: { fontFamily: fonts.body, fontSize: 16, color: colors.ink, height: 40 },
});
