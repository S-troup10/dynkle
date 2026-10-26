import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { QRCard } from '@/components/Payment';
import { Sheet } from '@/components/Sheet';
import { Button, T } from '@/components/ui';
import { colors, fonts } from '@/theme';

/** Customer scans this to save the receipt in the DYNK app or a browser. */
export default function ReceiptQr() {
  const { paymentId } = useLocalSearchParams<{ paymentId: string }>();
  const url = `https://pay.dynk.io/r/${paymentId}`;
  return (
    <Sheet onDismiss={() => router.back()}>
      <View style={{ alignItems: 'center', gap: 12, paddingBottom: 12 }}>
        <Text style={s.title}>Scan for your receipt</Text>
        <T style={{ textAlign: 'center' }}>Opens in the DYNK app, or any phone browser.</T>
        <View style={{ marginVertical: 12 }}>
          <QRCard value={url} size={200} />
        </View>
      </View>
      <Button title="Done" kind="dark" onPress={() => router.back()} />
    </Sheet>
  );
}

const s = StyleSheet.create({
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.ink },
});
