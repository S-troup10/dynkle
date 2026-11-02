import { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { Stack, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Orbitron_600SemiBold, Orbitron_700Bold, Orbitron_800ExtraBold } from '@expo-google-fonts/orbitron';
import { Outfit_400Regular, Outfit_500Medium, Outfit_600SemiBold } from '@expo-google-fonts/outfit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useKeepAwake } from 'expo-keep-awake';
import { startLiveConnection } from '@/api/live';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { RemoteChargeOverlay } from '@/components/RemoteChargeOverlay';
import { APP_VERSION } from '@/lib/config';
import { installGlobalErrorHandler, log } from '@/lib/logger';
import { useCheckout } from '@/state/checkout';
import { usePrefs } from '@/state/prefs';
import { useSession } from '@/state/session';
import { useUi } from '@/state/ui';
import { kiosk } from '@/native/hardware';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => undefined);
installGlobalErrorHandler();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

export default function RootLayout() {
  useKeepAwake();
  const [fontsLoaded] = useFonts({
    Orbitron_600SemiBold,
    Orbitron_700Bold,
    Orbitron_800ExtraBold,
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
  });
  const phase = useSession((s) => s.phase);
  const token = useSession((s) => s.token);
  const apiUrl = useSession((s) => s.apiUrl);
  const updateVersion = useUi((s) => s.updateVersion);
  const [ready, setReady] = useState(false);
  const restored = useRef(false);

  useEffect(() => {
    Promise.all([log.hydrate(), usePrefs.getState().hydrate(), useSession.getState().hydrate()]).then(() => {
      log.info('Terminal started', { version: APP_VERSION, phase: useSession.getState().phase });
      setReady(true);
    });
    return NetInfo.addEventListener((s) => {
      const ssid = s.type === 'wifi' ? ((s.details as { ssid?: string | null } | null)?.ssid ?? null) : null;
      useUi.getState().setNet(s.isConnected !== false, s.type, ssid);
    });
  }, []);

  useEffect(() => {
    if (fontsLoaded && ready) SplashScreen.hideAsync().catch(() => undefined);
  }, [fontsLoaded, ready]);

  // A paired terminal is a kiosk: pin it so customers can't leave the app.
  useEffect(() => {
    if (phase === 'paired' && kiosk.isDeviceOwner()) kiosk.start();
  }, [phase]);

  useEffect(() => {
    if (phase !== 'paired' || !token) return;
    return startLiveConnection(queryClient);
  }, [phase, token, apiUrl]);

  // The app was restarted (or crashed) mid-sale: put the payment back on screen.
  useEffect(() => {
    // Wait for fonts too: the navigator isn't mounted until then.
    if (!ready || !fontsLoaded || phase !== 'paired' || restored.current) return;
    restored.current = true;
    useCheckout
      .getState()
      .restore()
      .then((found) => {
        if (found) router.push('/checkout');
      });
  }, [ready, fontsLoaded, phase]);

  useEffect(() => {
    if (phase !== 'paired') {
      useCheckout.getState().finish(false);
      queryClient.clear();
    }
  }, [phase]);

  useEffect(() => {
    if (updateVersion) router.push('/update');
  }, [updateVersion]);

  if (!fontsLoaded || !ready) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <StatusBar style="dark" hidden={Platform.OS === 'android'} />
          <Stack screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: colors.bg } }}>
            <Stack.Protected guard={phase === 'onboarding'}>
              <Stack.Screen name="(onboarding)" />
            </Stack.Protected>
            <Stack.Protected guard={phase === 'unpaired'}>
              <Stack.Screen name="unpaired" />
            </Stack.Protected>
            <Stack.Protected guard={phase === 'paired'}>
              <Stack.Screen name="(main)" />
              <Stack.Screen name="update" options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />
            </Stack.Protected>
          </Stack>
          {phase === 'paired' ? <RemoteChargeOverlay /> : null}
        </ErrorBoundary>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
