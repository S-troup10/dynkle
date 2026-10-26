import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { categoryPath, childCategories, formatMoney, itemGroups, itemsIn, minPrice, type Item } from '@dynkle/shared';
import { BackHeader } from '@/components/Header';
import { CategoryGrid, OrderBar } from '@/components/Menu';
import { Screen, T } from '@/components/ui';
import { useCatalog } from '@/lib/useCatalog';
import { useCart } from '@/state/cart';
import { qtyOfItem } from '@/state/cartLogic';
import { colors, fonts, radius, shadows } from '@/theme';

export default function CategoryScreen() {
  const { categoryId } = useLocalSearchParams<{ categoryId: string }>();
  const { data: catalog } = useCatalog();
  const lines = useCart((s) => s.lines);
  const [group, setGroup] = useState<string | null>(null);

  const category = catalog?.categories.find((c) => c.id === categoryId);
  const items = useMemo(() => (catalog && categoryId ? itemsIn(catalog, categoryId) : []), [catalog, categoryId]);
  const groups = itemGroups(items);
  const visible = group ? items.filter((i) => i.group === group) : items;

  if (!catalog || !category) {
    return (
      <Screen edges={['top']}>
        <BackHeader title="Menu" />
        <T style={{ textAlign: 'center', marginTop: 40 }}>This category is no longer on the menu.</T>
      </Screen>
    );
  }

  const path = categoryPath(catalog, category.id);
  const parentName = path.length > 1 ? path[path.length - 2].name : 'Menu';
  const subs = childCategories(catalog, category.id);

  const open = (item: Item) => {
    if (item.variants.length === 1) {
      useCart.getState().addItem(item, item.variants[0], 1, path.length > 1 ? path.map((p) => p.name).join(' · ') : undefined);
    } else {
      router.push({ pathname: '/item/[itemId]', params: { itemId: item.id } });
    }
  };

  return (
    <Screen edges={['top']}>
      <BackHeader eyebrow={parentName} title={category.name} />
      {groups.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={s.chips}>
          {[null, ...groups].map((g) => {
            const on = group === g;
            return (
              <Pressable key={g ?? 'all'} onPress={() => setGroup(g)} style={[s.chip, on && s.chipOn]} testID={`group-${g ?? 'All'}`}>
                <Text style={[s.chipText, on && { color: colors.white }]}>{g ?? 'All'}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
      <ScrollView contentContainerStyle={s.content}>
        {subs.length > 0 ? <CategoryGrid catalog={catalog} categories={subs} /> : null}
        {visible.length > 0 ? (
          <View style={[s.list, subs.length > 0 && { marginTop: 16 }]}>
            {visible.map((item, i) => {
              const inOrder = qtyOfItem(lines, item.id);
              const sizes = item.variants.length === 1 ? 'Single size' : `${item.variants.length} sizes`;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => open(item)}
                  testID={`item-${item.name}`}
                  style={({ pressed }) => [
                    s.row,
                    i > 0 && s.divider,
                    (inOrder > 0 || pressed) && { backgroundColor: colors.orangeTint },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={s.name}>{item.name}</Text>
                    <Text style={s.sub}>{inOrder > 0 ? `${sizes} · ${inOrder} in order` : sizes}</Text>
                  </View>
                  <Text style={s.price}>
                    {item.variants.length > 1 ? `from ${formatMoney(minPrice(item))}` : formatMoney(minPrice(item))}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : subs.length === 0 ? (
          <T style={{ textAlign: 'center', marginTop: 40 }}>Nothing in here yet.</T>
        ) : null}
      </ScrollView>
      <OrderBar />
    </Screen>
  );
}

const s = StyleSheet.create({
  chips: { paddingHorizontal: 20, gap: 8, paddingBottom: 14 },
  chip: { height: 40, borderRadius: radius.pill, paddingHorizontal: 16, backgroundColor: colors.fill, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.ink },
  chipText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink },
  content: { paddingHorizontal: 20, paddingBottom: 110 },
  list: { backgroundColor: colors.white, borderRadius: radius.card, overflow: 'hidden', ...shadows.card },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, minHeight: 62, paddingVertical: 10 },
  divider: { borderTopWidth: 1, borderTopColor: colors.hairline },
  name: { fontFamily: fonts.bodyMedium, fontSize: 16, color: colors.ink },
  sub: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, marginTop: 2 },
  price: { fontFamily: fonts.display, fontSize: 14, color: colors.ink },
});
