import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '@/theme';
import { Icon, type IconName } from './Icon';

export const TABS: { name: string; label: string; icon: IconName }[] = [
  { name: 'keypad', label: 'Keypad', icon: 'keypad' },
  { name: 'items', label: 'Items', icon: 'items' },
  { name: 'activity', label: 'Activity', icon: 'activity' },
];

export function TabBar({ active, onSelect }: { active: string; onSelect: (name: string) => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.bar, { paddingBottom: 14 + insets.bottom, height: 84 + insets.bottom }]}>
      {TABS.map((t) => {
        const on = t.name === active;
        return (
          <Pressable
            key={t.name}
            onPress={() => onSelect(t.name)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            testID={`tab-${t.name}`}
            style={[s.tab, on && s.tabOn]}
          >
            <Icon name={t.icon} size={22} strokeWidth={2} color={on ? colors.white : colors.muted} />
            <Text style={[s.label, on && { color: colors.white }]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 10,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    backgroundColor: colors.white,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 18 },
  tabOn: { backgroundColor: colors.ink },
  label: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.muted },
});
