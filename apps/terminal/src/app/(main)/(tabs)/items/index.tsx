import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { childCategories } from '@dynkle/shared';
import { MerchantHeader } from '@/components/Header';
import { CategoryGrid, OrderBar } from '@/components/Menu';
import { OfflineBanner } from '@/components/OfflineBanner';
import { Button, Screen, T } from '@/components/ui';
import { syncedLabel, useCatalog } from '@/lib/useCatalog';
import { colors, fonts } from '@/theme';

export default function Menu() {
  const q = useCatalog();
  return (
    <Screen edges={['top']}>
      <MerchantHeader right="settings" />
      <OfflineBanner />
      <View style={s.head}>
        <Text style={s.title}>Menu</Text>
        <T v="small">{q.isSuccess ? syncedLabel(q.dataUpdatedAt) : ''}</T>
      </View>
      {q.data ? (
        <ScrollView contentContainerStyle={s.content}>
          {childCategories(q.data, null).length === 0 ? (
            <T style={{ textAlign: 'center', marginTop: 40 }}>No items yet. Add them in the dashboard or under Admin settings.</T>
          ) : (
            <CategoryGrid catalog={q.data} categories={childCategories(q.data, null)} />
          )}
        </ScrollView>
      ) : q.isError ? (
        <View style={s.center}>
          <T>Couldn’t load the menu.</T>
          <Button title="Try again" kind="secondary" onPress={() => q.refetch()} style={{ marginTop: 12, height: 48 }} />
        </View>
      ) : (
        <View style={s.center}>
          <ActivityIndicator color={colors.orange} />
        </View>
      )}
      <OrderBar />
    </Screen>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 20, marginTop: 4, marginBottom: 12 },
  title: { fontFamily: fonts.display, fontSize: 26, color: colors.ink },
  content: { paddingHorizontal: 20, paddingBottom: 110 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
