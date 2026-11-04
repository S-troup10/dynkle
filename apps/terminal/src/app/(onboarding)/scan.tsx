import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { BackHeader } from '@/components/Header';
import { Button, Screen, T } from '@/components/ui';

/**
 * Extracts the pairing code from whatever the dashboard's QR encodes: a bare
 * code, or a URL carrying it in a `code` query param or as the final path
 * segment. Falls back to the raw scanned text otherwise.
 */
function extractCode(data: string): string {
  const trimmed = data.trim();
  try {
    const url = new URL(trimmed);
    const fromQuery = url.searchParams.get('code');
    if (fromQuery) return fromQuery.toUpperCase();
    const last = url.pathname.split('/').filter(Boolean).pop();
    if (last) return last.toUpperCase();
  } catch {
    // Not a URL — treat the whole thing as the code.
  }
  return trimmed.toUpperCase();
}

export default function Scan() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  const onScan = ({ data }: BarcodeScanningResult) => {
    if (scanned) return;
    setScanned(true);
    router.navigate({ pathname: '/pair', params: { scannedCode: extractCode(data) } });
  };

  return (
    <Screen edges={['top']}>
      <BackHeader title="Scan QR code" />
      {!permission ? null : permission.granted ? (
        <CameraView
          style={s.camera}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={scanned ? undefined : onScan}
        />
      ) : (
        <View style={s.permission}>
          <T style={{ textAlign: 'center' }}>Camera access is needed to scan the pairing code shown on the dashboard.</T>
          <Button title="Allow camera" onPress={requestPermission} style={{ marginTop: 16 }} />
        </View>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  camera: { flex: 1 },
  permission: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30, gap: 10 },
});
