import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { categoryPath, formatMoney } from '@dynkle/shared';
import { Sheet } from '@/components/Sheet';
import { Button, IconButton, RoundButton, T } from '@/components/ui';
import { useCatalog } from '@/lib/useCatalog';
import { useCart } from '@/state/cart';
import { colors, fonts } from '@/theme';

export default function SizePicker() {
  const { itemId } = useLocalSearchParams<{ itemId: string }>();
  const { data: catalog } = useCatalog();
  const item = catalog?.items.find((i) => i.id === itemId);
  const [variantId, setVariantId] = useState<string | null>(item?.variants[Math.min(1, item.variants.length - 1)]?.id ?? null);
  const [qty, setQty] = useState(1);
  const close = () => router.back();

  if (!catalog || !item) return <Sheet onDismiss={close}><T>Item not found.</T></Sheet>;
  const variant = item.variants.find((v) => v.id === variantId) ?? item.variants[0];
  const category = categoryPath(catalog, item.categoryId).map((c) => c.name).join(' · ');

  const add = () => {
    useCart.getState().addItem(item, variant, qty);
    close();
  };

  return (
    <Sheet onDismiss={close}>
      <View style={s.head}>
        <View style={{ flex: 1 }}>
          <T v="eyebrow">{category}</T>
          <Text style={s.title}>{item.name}</Text>
        </View>
        <IconButton name="close" onPress={close} label="Close" />
      </View>
      <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 12, paddingVertical: 16 }}>
        {item.variants.map((v) => {
          const on = v.id === variant.id;
          return (
            <Pressable key={v.id} onPress={() => setVariantId(v.id)} style={[s.option, on && s.optionOn]} testID={`size-${v.name}`}>
              <View style={[s.radio, on && s.radioOn]}>{on ? <View style={s.radioDot} /> : null}</View>
              <Text style={[s.optName, on && { fontFamily: fonts.bodySemi }]}>{v.name}</Text>
              <Text style={s.optPrice}>{formatMoney(v.priceCents)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={s.qtyRow}>
        <Text style={s.qtyLabel}>Quantity</Text>
        <View style={s.stepper}>
          <RoundButton name="minus" size={48} onPress={() => setQty((q) => Math.max(1, q - 1))} testID="qty-minus" />
          <Text style={s.qty}>{qty}</Text>
          <RoundButton name="plus" size={48} onPress={() => setQty((q) => Math.min(99, q + 1))} testID="qty-plus" />
        </View>
      </View>
      <Button title={`Add to order · ${formatMoney(variant.priceCents * qty)}`} onPress={add} testID="add-to-order" />
    </Sheet>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontFamily: fonts.display, fontSize: 26, color: colors.ink, marginTop: 4 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    height: 64,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 18,
    backgroundColor: colors.white,
  },
  optionOn: { borderColor: colors.orange, backgroundColor: colors.orangeTint },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: 'rgba(33,35,32,0.25)', alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.orange },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.orange },
  optName: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 17, color: colors.ink },
  optPrice: { fontFamily: fonts.display, fontSize: 15, color: colors.ink },
  qtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  qtyLabel: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.ink },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  qty: { fontFamily: fonts.display, fontSize: 20, color: colors.ink, minWidth: 24, textAlign: 'center' },
});
