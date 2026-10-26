import { useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { categoryPath } from '@dynkle/shared';
import { api, type VariantInput } from '@/api/client';
import { BackHeader } from '@/components/Header';
import { Button, Card, RoundButton, Screen, SectionLabel, T } from '@/components/ui';
import { touchAdmin, useAdminGuard } from '@/hooks/useAdmin';
import { useCatalog } from '@/lib/useCatalog';
import { colors, fonts } from '@/theme';

interface SizeDraft {
  id?: string;
  name: string;
  price: string;
}

const toDollars = (cents: number) => (cents / 100).toFixed(2);
const toCents = (s: string) => Math.round(parseFloat(s.replace(/[^0-9.]/g, '')) * 100);

export default function EditItem() {
  useAdminGuard();
  const { itemId, categoryId } = useLocalSearchParams<{ itemId?: string; categoryId?: string }>();
  const { data: catalog } = useCatalog();
  const qc = useQueryClient();
  const existing = catalog?.items.find((i) => i.id === itemId);
  const catId = existing?.categoryId ?? categoryId ?? '';

  const [name, setName] = useState(existing?.name ?? '');
  const [group, setGroup] = useState(existing?.group ?? '');
  const [sizes, setSizes] = useState<SizeDraft[]>(
    existing?.variants.map((v) => ({ id: v.id, name: v.name, price: toDollars(v.priceCents) })) ?? [{ name: 'Regular', price: '' }],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const crumbs = catalog && catId ? categoryPath(catalog, catId).map((c) => c.name).join(' · ') : '';
  const valid = name.trim().length > 0 && sizes.length > 0 && sizes.every((s) => s.name.trim() && toCents(s.price) >= 0 && !Number.isNaN(toCents(s.price)));

  const save = async () => {
    touchAdmin();
    setBusy(true);
    setError(null);
    const variants: VariantInput[] = sizes.map((s) => ({ id: s.id, name: s.name.trim(), priceCents: toCents(s.price) }));
    try {
      if (existing) await api.updateItem(existing.id, { name: name.trim(), group: group.trim(), variants });
      else await api.addItem({ categoryId: catId, name: name.trim(), group: group.trim() || undefined, variants });
      await qc.invalidateQueries({ queryKey: ['catalog'] });
      router.back();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const remove = () => {
    if (!existing) return;
    const go = async () => {
      touchAdmin();
      await api.deleteItem(existing.id).catch((e) => setError((e as Error).message));
      await qc.invalidateQueries({ queryKey: ['catalog'] });
      router.back();
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`Delete ${existing.name}?`)) go();
    } else {
      Alert.alert(`Delete ${existing.name}?`, "It'll disappear from every terminal.", [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: go },
      ]);
    }
  };

  const update = (i: number, patch: Partial<SizeDraft>) => setSizes((all) => all.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  return (
    <Screen>
      <BackHeader title={existing ? 'Edit item' : 'New item'} eyebrow={crumbs} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }} keyboardShouldPersistTaps="handled">
        <SectionLabel>DETAILS</SectionLabel>
        <Card style={{ gap: 12 }}>
          <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. Flat white" testID="item-name" />
          <Field label="Group (optional)" value={group} onChangeText={setGroup} placeholder="e.g. Milk coffee" />
        </Card>

        <SectionLabel>SIZES AND PRICES</SectionLabel>
        <Card style={{ gap: 12 }}>
          {sizes.map((sz, i) => (
            <View key={i} style={s.sizeRow}>
              <TextInput
                value={sz.name}
                onChangeText={(v) => update(i, { name: v })}
                placeholder="Size"
                placeholderTextColor={colors.muted}
                style={[s.input, { flex: 1 }]}
                testID={`size-name-${i}`}
              />
              <View style={[s.input, s.priceBox]}>
                <Text style={s.dollar}>$</Text>
                <TextInput
                  value={sz.price}
                  onChangeText={(v) => update(i, { price: v })}
                  placeholder="0.00"
                  placeholderTextColor={colors.muted}
                  keyboardType="decimal-pad"
                  style={s.priceInput}
                  testID={`size-price-${i}`}
                />
              </View>
              <RoundButton name="close" size={36} onPress={() => setSizes((all) => all.filter((_, j) => j !== i))} />
            </View>
          ))}
          <Button
            title="Add size"
            kind="secondary"
            icon="plus"
            style={{ height: 48 }}
            onPress={() => setSizes((all) => [...all, { name: all.length === 1 ? 'Large' : '', price: '' }])}
          />
        </Card>
        {error ? <T style={{ color: colors.red, marginTop: 12 }}>{error}</T> : null}
        {existing ? <Button title="Delete item" kind="ghost" onPress={remove} style={{ marginTop: 16 }} /> : null}
      </ScrollView>
      <View style={{ padding: 20 }}>
        <Button title="Save" disabled={!valid} loading={busy} onPress={save} testID="save-item" />
      </View>
    </Screen>
  );
}

function Field({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput {...props} placeholderTextColor={colors.muted} style={s.input} />
    </View>
  );
}

const s = StyleSheet.create({
  label: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  input: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.white,
  },
  sizeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  priceBox: { width: 104, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10 },
  dollar: { fontFamily: fonts.body, fontSize: 16, color: colors.muted },
  priceInput: { flex: 1, fontFamily: fonts.body, fontSize: 16, color: colors.ink, height: 46, marginLeft: 4 },
});
