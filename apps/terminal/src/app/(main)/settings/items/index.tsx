import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { categorySummary, childCategories } from '@dynkle/shared';
import { api } from '@/api/client';
import { BackHeader } from '@/components/Header';
import { PromptDialog } from '@/components/Prompt';
import { Button, List, Row, Screen, T } from '@/components/ui';
import { touchAdmin, useAdminGuard } from '@/hooks/useAdmin';
import { useCatalog } from '@/lib/useCatalog';

export default function ManageItems() {
  useAdminGuard();
  const { data: catalog } = useCatalog();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async (name: string) => {
    setAdding(false);
    touchAdmin();
    try {
      await api.addCategory(name, null);
      qc.invalidateQueries({ queryKey: ['catalog'] });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const top = catalog ? childCategories(catalog, null) : [];
  return (
    <Screen>
      <BackHeader title="Manage items" eyebrow="Admin" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20, gap: 14 }}>
        <T>Changes sync to the merchant dashboard and every terminal straight away.</T>
        {top.length > 0 ? (
          <List>
            {top.map((c) => (
              <Row
                key={c.id}
                label={c.name}
                value={catalog ? categorySummary(catalog, c.id) : ''}
                chevron
                onPress={() => {
                  touchAdmin();
                  router.push({ pathname: '/settings/items/[categoryId]', params: { categoryId: c.id } });
                }}
                testID={`manage-${c.name}`}
              />
            ))}
          </List>
        ) : null}
        {error ? <T style={{ color: '#AD0D0D' }}>{error}</T> : null}
      </ScrollView>
      <View style={{ padding: 20 }}>
        <Button title="Add category" icon="plus" onPress={() => setAdding(true)} testID="add-category" />
      </View>
      <PromptDialog visible={adding} title="New category" placeholder="e.g. Specials" confirm="Add" onSubmit={add} onCancel={() => setAdding(false)} />
    </Screen>
  );
}
