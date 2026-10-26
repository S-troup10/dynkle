import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { formatMoney, type PaymentSession } from '@dynkle/shared';
import { api } from '@/api/client';
import { MerchantHeader } from '@/components/Header';
import { OfflineBanner } from '@/components/OfflineBanner';
import { Glow, Pill, Screen, T } from '@/components/ui';
import { formatTime, paymentSubtitle, paymentTitle } from '@/lib/format';
import { useSession } from '@/state/session';
import { colors, fonts, radius, shadows } from '@/theme';

export default function Activity() {
  const till = useSession((s) => s.profile?.till.name);
  const q = useQuery({ queryKey: ['transactions'], queryFn: api.transactions });
  const d = q.data;

  return (
    <Screen edges={['top']}>
      <MerchantHeader right="settings" />
      <OfflineBanner />
      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={colors.orange} />}
      >
        <View style={s.summary}>
          <View style={[StyleSheet.absoluteFill, { left: '40%', top: -40 }]}>
            <Glow position="top" color="rgba(255,128,0,0.35)" />
          </View>
          <Text style={s.summaryEyebrow}>TODAY · {till?.toUpperCase()}</Text>
          <Text style={s.summaryAmount} testID="today-total">
            {formatMoney(d?.totalPaidCents ?? 0)}
          </Text>
          <Text style={s.summarySub}>
            {d ? `${d.paidCount} paid · ${d.failedCount} failed · ${d.expiredCount} expired` : ' '}
          </Text>
        </View>

        {q.isLoading ? (
          <ActivityIndicator color={colors.orange} style={{ marginTop: 30 }} />
        ) : d && d.transactions.length > 0 ? (
          <View style={s.list}>
            {d.transactions.map((p, i) => (
              <TxRow key={p.id} p={p} first={i === 0} />
            ))}
          </View>
        ) : (
          <T style={{ textAlign: 'center', marginTop: 30 }}>No payments yet today.</T>
        )}
      </ScrollView>
    </Screen>
  );
}

export function StatusPill({ status }: { status: PaymentSession['status'] }) {
  if (status === 'paid') return <Pill tone="green" style={s.pill}>Paid</Pill>;
  if (status === 'failed') return <Pill tone="red" style={s.pill}>Failed</Pill>;
  if (status === 'expired') return <Pill tone="amber" style={s.pill}>Expired</Pill>;
  return <Pill style={s.pill}>{status}</Pill>;
}

function TxRow({ p, first }: { p: PaymentSession; first: boolean }) {
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/activity/[paymentId]', params: { paymentId: p.id } })}
      style={({ pressed }) => [s.row, !first && s.divider, pressed && { backgroundColor: colors.orangeTint }]}
      testID={`tx-${p.id}`}
    >
      <Text style={s.time}>{formatTime(p.createdAt)}</Text>
      <View style={{ flex: 1 }}>
        <Text style={s.title} numberOfLines={1}>
          {paymentTitle(p)}
        </Text>
        <Text style={s.sub}>{paymentSubtitle(p)}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={s.amount}>{formatMoney(p.totalCents)}</Text>
        <StatusPill status={p.status} />
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 24, gap: 14 },
  summary: { backgroundColor: colors.ink, borderRadius: radius.card, padding: 20, overflow: 'hidden', gap: 4 },
  summaryEyebrow: { fontFamily: fonts.bodyMedium, fontSize: 12, letterSpacing: 2, color: 'rgba(255,255,255,0.75)' },
  summaryAmount: { fontFamily: fonts.displayHeavy, fontSize: 34, color: colors.white, marginTop: 4 },
  summarySub: { fontFamily: fonts.body, fontSize: 14, color: 'rgba(255,255,255,0.75)', marginTop: 4 },
  list: { backgroundColor: colors.white, borderRadius: radius.card, overflow: 'hidden', ...shadows.card },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  divider: { borderTopWidth: 1, borderTopColor: colors.hairline },
  time: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, width: 52 },
  title: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.ink },
  sub: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, marginTop: 2 },
  amount: { fontFamily: fonts.display, fontSize: 14, color: colors.ink },
  pill: { height: 20, paddingHorizontal: 8, alignSelf: 'flex-end' },
});
