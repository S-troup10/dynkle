import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { formatFee, formatMoney } from '@dynkle/shared';
import { api } from '@/api/client';
import { BackHeader } from '@/components/Header';
import { Button, Card, Divider, Pill, Screen, T } from '@/components/ui';
import { formatTime, isToday, methodLabel } from '@/lib/format';
import { useSession } from '@/state/session';
import { colors, fonts } from '@/theme';

export default function TransactionDetail() {
  const { paymentId } = useLocalSearchParams<{ paymentId: string }>();
  const till = useSession((s) => s.profile?.till.name);
  const q = useQuery({ queryKey: ['payment', paymentId], queryFn: () => api.getPayment(paymentId!) });
  const p = q.data;

  if (!p) {
    return (
      <Screen edges={['top']}>
        <BackHeader title="Payment" />
        <T style={{ textAlign: 'center', marginTop: 40 }}>{q.isError ? 'Couldn’t load this payment.' : 'Loading…'}</T>
      </Screen>
    );
  }

  const when = `${formatTime(p.completedAt ?? p.createdAt)}${isToday(p.createdAt) ? ' today' : ''}`;
  const status =
    p.status === 'paid' ? (
      <Pill tone="green" style={s.statusPill}>
        {`✓ Paid · ${when}`}
      </Pill>
    ) : p.status === 'failed' ? (
      <Pill tone="red" style={s.statusPill}>{`Failed · ${when}`}</Pill>
    ) : (
      <Pill tone="amber" style={s.statusPill}>{`Expired · ${when}`}</Pill>
    );

  return (
    <Screen edges={['top', 'bottom']}>
      <BackHeader title="Payment" />
      <ScrollView contentContainerStyle={s.content}>
        <View style={{ alignItems: 'center', gap: 10, marginVertical: 18 }}>
          <Text style={s.amount}>{formatMoney(p.totalCents)}</Text>
          {status}
        </View>
        <Card style={{ padding: 0 }}>
          <Line label="Paid with" value={p.method ? methodLabel(p.method) : 'No payment'} strong />
          <Divider />
          <Line label="Sale" value={formatMoney(p.subtotalCents)} />
          <Divider />
          <Line label="Tip" value={formatMoney(p.tipCents)} />
          <Divider />
          <Line label="Customer fee" value={formatFee(p.customerFeeCents)} />
          {p.customerWallet ? (
            <>
              <Divider />
              <Line label="Customer wallet" value={p.customerWallet} />
            </>
          ) : null}
          {p.reference ? (
            <>
              <Divider />
              <Line label="Reference" value={p.reference} />
            </>
          ) : null}
          <Divider />
          <Line label="Till" value={till ?? ''} />
        </Card>
        {p.lines.length > 0 ? (
          <Card style={{ marginTop: 14, gap: 8 }}>
            <T v="eyebrow" style={{ marginBottom: 2 }}>
              Items
            </T>
            {p.lines.map((l) => (
              <View key={l.id} style={s.item}>
                <Text style={s.itemText}>
                  {l.kind === 'custom' ? l.name : `${l.qty} × ${l.name}${l.detail && !l.detail.includes('·') ? `, ${l.detail}` : ''}`}
                </Text>
                <Text style={s.itemText}>{formatMoney(l.unitCents * l.qty)}</Text>
              </View>
            ))}
          </Card>
        ) : null}
        {p.failureReason ? (
          <Card style={{ marginTop: 14 }}>
            <T v="eyebrow">Reason</T>
            <Text style={[s.itemText, { marginTop: 6 }]}>{p.failureReason}</Text>
          </Card>
        ) : null}
      </ScrollView>
      {p.status === 'paid' ? (
        <View style={{ padding: 20 }}>
          <Button
            title="Show receipt QR"
            kind="secondary"
            icon="scan"
            onPress={() => router.push({ pathname: '/receipt/[paymentId]', params: { paymentId: p.id } })}
          />
        </View>
      ) : null}
    </Screen>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={s.line}>
      <Text style={s.lineLabel}>{label}</Text>
      <Text style={[s.lineValue, strong && { fontFamily: fonts.bodySemi }]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 24 },
  amount: { fontFamily: fonts.displayHeavy, fontSize: 44, color: colors.ink },
  statusPill: { alignSelf: 'center' },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, height: 52 },
  lineLabel: { fontFamily: fonts.body, fontSize: 14, color: colors.muted },
  lineValue: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.ink },
  item: { flexDirection: 'row', justifyContent: 'space-between' },
  itemText: { fontFamily: fonts.body, fontSize: 15, color: colors.ink },
});
