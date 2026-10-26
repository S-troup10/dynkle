import { Stack } from 'expo-router';
import { colors } from '@/theme';

export default function MainLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right', contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
      <Stack.Screen
        name="item/[itemId]"
        options={{ presentation: 'transparentModal', animation: 'fade', contentStyle: { backgroundColor: 'transparent' } }}
      />
      <Stack.Screen
        name="receipt/[paymentId]"
        options={{ presentation: 'transparentModal', animation: 'fade', contentStyle: { backgroundColor: 'transparent' } }}
      />
      <Stack.Screen
        name="settings/unpair"
        options={{ presentation: 'transparentModal', animation: 'fade', contentStyle: { backgroundColor: 'transparent' } }}
      />
      <Stack.Screen name="checkout/tip" options={{ animation: 'fade', gestureEnabled: false }} />
      <Stack.Screen name="checkout/index" options={{ animation: 'fade', gestureEnabled: false }} />
      <Stack.Screen name="paired" options={{ animation: 'fade', gestureEnabled: false }} />
    </Stack>
  );
}
