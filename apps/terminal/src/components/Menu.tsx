import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { categorySummary, formatMoney, type Catalog, type Category } from '@dynkle/shared';
import { useCart } from '@/state/cart';
import { cartCount, cartTotal } from '@/state/cartLogic';
import { colors, fonts, radius, shadows } from '@/theme';
import { Icon } from './Icon';

export function CategoryGrid({ catalog, categories }: { catalog: Catalog; categories: Category[] }) {
  return (
    <View style={s.grid}>
      {categories.map((c) => (
        <Pressable
          key={c.id}
          onPress={() => router.push({ pathname: '/items/[categoryId]', params: { categoryId: c.id } })}
          style={({ pressed }) => [s.tile, pressed && { backgroundColor: colors.orangeTint }]}
          testID={`category-${c.name}`}
        >
          <View style={s.letter}>
            <Text style={s.letterText}>{c.name.charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={s.tileName} numberOfLines={1}>
            {c.name}
          </Text>
          <Text style={s.tileSub}>{categorySummary(catalog, c.id)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Floating "2 items · $11.00   [View order →]" bar above the tab bar. */
export function OrderBar() {
  const lines = useCart((st) => st.lines);
  const count = cartCount(lines);
  if (count === 0) return null;
  return (
    <View style={s.barWrap} pointerEvents="box-none">
      <View style={s.bar}>
        <Text style={s.barText}>
          {count} {count === 1 ? 'item' : 'items'} · {formatMoney(cartTotal(lines))}
        </Text>
        <Pressable style={s.barBtn} onPress={() => router.push('/order')} testID="view-order">
          <Text style={s.barBtnText}>View order</Text>
          <Icon name="arrowRight" size={16} color={colors.white} />
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: {
    width: '47%',
    flexGrow: 1,
    backgroundColor: colors.white,
    borderRadius: radius.card,
    padding: 16,
    minHeight: 116,
    ...shadows.card,
  },
  letter: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.orangeTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  letterText: { fontFamily: fonts.display, fontSize: 16, color: colors.orange },
  tileName: { fontFamily: fonts.bodyMedium, fontSize: 18, color: colors.ink },
  tileSub: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, marginTop: 2 },
  barWrap: { position: 'absolute', left: 20, right: 20, bottom: 16 },
  bar: {
    height: 60,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 22,
    paddingRight: 8,
    ...shadows.raised,
  },
  barText: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.white },
  barBtn: {
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.orange,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
  },
  barBtnText: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.white },
});
