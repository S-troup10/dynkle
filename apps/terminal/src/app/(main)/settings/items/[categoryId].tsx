import { useState } from 'react';
import { Alert, Platform, ScrollView } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { categoryPath, categorySummary, childCategories, formatMoney, itemsIn, minPrice } from '@dynkle/shared';
import { api } from '@/api/client';
import { BackHeader } from '@/components/Header';
import { PromptDialog } from '@/components/Prompt';
import { Button, List, Row, Screen, SectionLabel, T } from '@/components/ui';
import { touchAdmin, useAdminGuard } from '@/hooks/useAdmin';
import { useCatalog } from '@/lib/useCatalog';

function confirmDelete(name: string, onYes: () => void) {
  const msg = `Delete ${name} and everything in it? This can't be undone.`;
  if (Platform.OS === 'web') {
    if (window.confirm(msg)) onYes();
  } else {
    Alert.alert('Delete category?', msg, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onYes },
    ]);
  }
}

export default function ManageCategory() {
  useAdminGuard();
  const { categoryId } = useLocalSearchParams<{ categoryId: string }>();
  const { data: catalog } = useCatalog();
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<'rename' | 'group' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const category = catalog?.categories.find((c) => c.id === categoryId);

  if (!catalog || !category) {
    return (
      <Screen>
        <BackHeader title="Category" />
        <T style={{ textAlign: 'center', marginTop: 30 }}>This category was removed.</T>
      </Screen>
    );
  }

  const run = async (fn: () => Promise<unknown>) => {
    touchAdmin();
    setError(null);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ['catalog'] });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const path = categoryPath(catalog, category.id);
  const subs = childCategories(catalog, category.id);
  const items = itemsIn(catalog, category.id);

  return (
    <Screen>
      <BackHeader title={category.name} eyebrow={path.length > 1 ? path[path.length - 2].name : 'Manage items'} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}>
        <List>
          <Row label="Name" value={category.name} chevron onPress={() => setDialog('rename')} />
        </List>

        {subs.length > 0 || path.length === 1 ? <SectionLabel>GROUPS</SectionLabel> : null}
        {subs.length > 0 ? (
          <List>
            {subs.map((c) => (
              <Row
                key={c.id}
                label={c.name}
                value={categorySummary(catalog, c.id)}
                chevron
                onPress={() => router.push({ pathname: '/settings/items/[categoryId]', params: { categoryId: c.id } })}
              />
            ))}
          </List>
        ) : null}
        {path.length === 1 ? (
          <Button title="Add group" kind="secondary" icon="plus" style={{ marginTop: 10, height: 50 }} onPress={() => setDialog('group')} />
        ) : null}

        <SectionLabel>ITEMS</SectionLabel>
        {items.length > 0 ? (
          <List>
            {items.map((i) => (
              <Row
                key={i.id}
                label={i.name}
                sub={i.variants.length > 1 ? `${i.variants.length} sizes${i.group ? ` · ${i.group}` : ''}` : (i.group ?? 'Single size')}
                value={formatMoney(minPrice(i))}
                chevron
                onPress={() => router.push({ pathname: '/settings/items/edit', params: { itemId: i.id } })}
                testID={`edit-${i.name}`}
              />
            ))}
          </List>
        ) : (
          <T>No items yet.</T>
        )}
        <Button
          title="Add item"
          icon="plus"
          style={{ marginTop: 12 }}
          onPress={() => router.push({ pathname: '/settings/items/edit', params: { categoryId: category.id } })}
          testID="add-item"
        />
        {error ? <T style={{ color: '#AD0D0D', marginTop: 10 }}>{error}</T> : null}
        <Button
          title="Delete category"
          kind="ghost"
          onPress={() =>
            confirmDelete(category.name, () =>
              run(() => api.deleteCategory(category.id)).then(() => router.back()),
            )
          }
          style={{ marginTop: 16 }}
        />
      </ScrollView>
      <PromptDialog
        visible={dialog === 'rename'}
        title="Rename category"
        initial={category.name}
        onSubmit={(name) => {
          setDialog(null);
          run(() => api.updateCategory(category.id, { name }));
        }}
        onCancel={() => setDialog(null)}
      />
      <PromptDialog
        visible={dialog === 'group'}
        title={`New group in ${category.name}`}
        placeholder="e.g. Breads"
        confirm="Add"
        onSubmit={(name) => {
          setDialog(null);
          run(() => api.addCategory(name, category.id));
        }}
        onCancel={() => setDialog(null)}
      />
    </Screen>
  );
}
