import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useOffline } from '@/state/ui';
import { colors, fonts } from '@/theme';
import { Banner } from './Payment';

export function OfflineBanner() {
  const { offline, reason } = useOffline();
  if (!offline) return null;
  return (
    <View style={{ paddingHorizontal: 20, marginBottom: 8 }} testID="offline-banner">
      <Banner
        tone="dark"
        icon="wifiOff"
        title={reason === 'network' ? 'No internet connection' : "Can't reach Dynkle"}
        body="Payments are paused until you're back online."
        action={
          <Pressable onPress={() => router.push('/settings/network')} hitSlop={10}>
            <Text style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: colors.orange }}>Fix</Text>
          </Pressable>
        }
      />
    </View>
  );
}
