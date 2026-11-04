import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { categorySummary, formatMoney, type Catalog, type Category } from '@dynkle/shared';
import { FadeInUp, usePressScale } from '@/components/ui/motion';
import { haptics } from '@/lib/haptics';
import { useCart } from '@/state/cart';
import { cartCount, cartTotal } from '@/state/cartLogic';
import { colors, cs, fonts, radius, shadows } from '@/theme';
import { Icon } from './Icon';

export function CategoryGrid({ catalog, categories }: { catalog: Catalog; categories: Category[] }) {
  return (
    <View style={s.grid}>
      {categories.map((c, i) => (
        <FadeInUp key={c.id} delay={Math.min(i, 6) * 30} style={{ width: '47%', flexGrow: 1 }}>
          <CategoryTile catalog={catalog} category={c} />
        </FadeInUp>
      ))}
    </View>
  );
}

function CategoryTile({ catalog, category: c }: { catalog: Catalog; category: Category }) {
  const { style: pressStyle, handlers } = usePressScale(0.96);
  return (
    <Pressable
      onPress={() => {
        haptics.tap();
        router.push({ pathname: '/items/[categoryId]', params: { categoryId: c.id } });
      }}
      testID={`category-${c.name}`}
      {...handlers}
    >
      <Animated.View style={[s.tile, pressStyle]}>
        <View style={s.letter}>
          <Text style={s.letterText}>{c.name.charAt(0).toUpperCase()}</Text>
        </View>
        <Text style={s.tileName} numberOfLines={1}>
          {c.name}
        </Text>
        <Text style={s.tileSub}>{categorySummary(catalog, c.id)}</Text>
      </Animated.View>
    </Pressable>
  );
}

/** Floating "2 items · $11.00   [View order →]" bar above the tab bar. */
export function OrderBar() {
  const lines = useCart((st) => st.lines);
  const count = cartCount(lines);
  const { style: pressStyle, handlers } = usePressScale(0.95);
  if (count === 0) return null;
  return (
    <View style={s.barWrap} pointerEvents="box-none">
      <FadeInUp distance={24}>
        <View style={s.bar}>
          <Text style={s.barText}>
            {count} {count === 1 ? 'item' : 'items'} · {formatMoney(cartTotal(lines))}
          </Text>
          <Pressable
            onPress={() => {
              haptics.tap();
              router.push('/order');
            }}
            testID="view-order"
            {...handlers}
          >
            <Animated.View style={[s.barBtn, pressStyle]}>
              <Text style={s.barBtnText}>View order</Text>
              <Icon name="arrowRight" size={16} color={colors.white} />
            </Animated.View>
          </Pressable>
        </View>
      </FadeInUp>
    </View>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: cs(12, 8) },
  tile: {
    backgroundColor: colors.white,
    borderRadius: radius.card,
    padding: cs(16, 12),
    minHeight: cs(116, 90),
    ...shadows.card,
  },
  letter: {
    width: cs(40, 32),
    height: cs(40, 32),
    borderRadius: cs(20, 16),
    backgroundColor: colors.orangeTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: cs(10, 6),
  },
  letterText: { fontFamily: fonts.display, fontSize: cs(16, 14), color: colors.orange },
  tileName: { fontFamily: fonts.bodyMedium, fontSize: cs(18, 15), color: colors.ink },
  tileSub: { fontFamily: fonts.body, fontSize: cs(13, 12), color: colors.muted, marginTop: 2 },
  barWrap: { position: 'absolute', left: 20, right: 20, bottom: cs(16, 10) },
  bar: {
    height: cs(60, 50),
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 22,
    paddingRight: 8,
    ...shadows.raised,
  },
  barText: { fontFamily: fonts.bodySemi, fontSize: cs(16, 14), color: colors.white },
  barBtn: {
    height: cs(44, 38),
    borderRadius: radius.pill,
    backgroundColor: colors.orange,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: cs(18, 14),
  },
  barBtnText: { fontFamily: fonts.bodySemi, fontSize: cs(16, 14), color: colors.white },
});
