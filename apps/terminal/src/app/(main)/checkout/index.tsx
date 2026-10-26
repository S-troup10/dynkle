import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { formatMoney, type PaymentSession } from '@dynkle/shared';
import { api } from '@/api/client';
import { MerchantHeader } from '@/components/Header';
import { Icon } from '@/components/Icon';
import { Banner, MethodChips, PriceLock, QRCard, Steps } from '@/components/Payment';
import { Spinner } from '@/components/Spinner';
import { Button, Halo, Headline, Pill, Screen, T } from '@/components/ui';
import { useCountdown } from '@/hooks/useCountdown';
import { methodLabel } from '@/lib/format';
import { bluetooth, nfc } from '@/native/hardware';
import { useCheckout } from '@/state/checkout';
import { checkoutView, confirmationSteps } from '@/state/checkoutLogic';
import { useSession } from '@/state/session';
import { useUi } from '@/state/ui';
import { colors, fonts, shadows } from '@/theme';

const AUTO_RETURN_SECONDS = 5;

function backToSelling() {
  if (router.canDismiss()) router.dismissTo('/keypad');
  else router.replace('/keypad');
}

/** Ends the sale. Orders rung up here are cleared; a dashboard charge leaves the keyed entry alone. */
function endSale() {
  const { draft } = useCheckout.getState();
  useCheckout.getState().finish(draft?.source !== 'dashboard');
  backToSelling();
}

export default function Checkout() {
  const payment = useCheckout((s) => s.payment);
  const socket = useUi((s) => s.socket);

  // Fallback polling when the live connection is down.
  useEffect(() => {
    if (!payment || socket === 'open') return;
    if (!['armed', 'wallet_connected', 'approved', 'confirming'].includes(payment.status)) return;
    const t = setInterval(() => {
      api.getPayment(payment.id).then(useCheckout.getState().onStatus).catch(() => undefined);
    }, 2000);
    return () => clearInterval(t);
  }, [payment, socket]);

  // Serve the payment link over NFC only while the customer can still pay.
  const nfcUri = payment && (payment.status === 'armed' || payment.status === 'wallet_connected') ? payment.ndefUrl : null;
  useEffect(() => {
    nfc.arm(nfcUri);
    return () => nfc.arm(null);
  }, [nfcUri]);

  useEffect(() => {
    if (payment?.status === 'cancelled') backToSelling();
  }, [payment?.status]);

  if (!payment) return <Screen><View /></Screen>;

  switch (checkoutView(payment.status)) {
    case 'armed':
      return <Armed payment={payment} />;
    case 'confirming':
      return <Confirming payment={payment} />;
    case 'processing':
      return <Processing payment={payment} />;
    case 'paid':
      return <Paid payment={payment} />;
    case 'failed':
      return <Failed payment={payment} />;
    case 'expired':
      return <Expired payment={payment} />;
    default:
      return <Screen><View /></Screen>;
  }
}

// ---------- 16 / 18 / 31: Armed ----------

function Armed({ payment }: { payment: PaymentSession }) {
  const lockSeconds = useSession((s) => s.profile?.settings.priceLockSeconds) ?? 90;
  const left = useCountdown(payment.expiresAt);
  const [tapState, setTapState] = useState(nfc.state());
  const btState = bluetooth.state();

  useEffect(() => {
    const t = setInterval(() => setTapState(nfc.state()), 2000);
    return () => clearInterval(t);
  }, []);

  const tapOk = tapState === 'ready';
  const fromDashboard = payment.source === 'dashboard';

  return (
    <Screen glow="center">
      <MerchantHeader
        tillDot={false}
        right={
          <View style={s.armed}>
            <View style={s.armedDot} />
            <Text style={s.armedText}>Armed</Text>
          </View>
        }
      />
      <View style={s.armedBody}>
        {!tapOk ? (
          <Banner icon="warning" tone="amber" title="Tap isn't working right now" body="Customers can still scan or connect with DYNK." />
        ) : null}
        {fromDashboard ? (
          <View style={s.dashPill}>
            <Icon name="monitor" size={16} color={colors.orange} strokeWidth={2} />
            <Text style={s.dashPillText}>Sent from dashboard{payment.reference ? ` · ${payment.reference}` : ''}</Text>
          </View>
        ) : null}
        <View style={{ alignItems: 'center' }}>
          <Text style={s.armedAmount} testID="armed-amount" adjustsFontSizeToFit numberOfLines={1}>
            {formatMoney(payment.totalCents)}
          </Text>
          {payment.tipCents > 0 ? <T>Includes {formatMoney(payment.tipCents)} tip</T> : null}
        </View>
        <QRCard value={payment.qrUrl} size={190} />
        <T style={s.caption}>Tap your phone on the terminal, connect with DYNK, or scan with any Solana wallet.</T>
        <MethodChips tap={tapOk ? 'ready' : 'unavailable'} connect={btState === 'ready' ? 'ready' : 'unavailable'} scan="ready" />
      </View>
      <View style={{ paddingHorizontal: 20, paddingBottom: 20, gap: 14 }}>
        <PriceLock secondsLeft={left} totalSeconds={lockSeconds} />
        <Button
          title="Cancel charge"
          kind="secondary"
          testID="cancel-charge"
          onPress={async () => {
            await useCheckout.getState().cancel();
            if (fromDashboard) useCheckout.getState().finish(false);
            backToSelling();
          }}
        />
      </View>
    </Screen>
  );
}

// ---------- 19: Customer confirming ----------

function Confirming({ payment }: { payment: PaymentSession }) {
  const how = payment.method
    ? `${payment.method.wallet} connected by ${payment.method.channel === 'qr' ? 'QR' : payment.method.channel}`
    : 'Wallet connected';
  return (
    <Screen glow="top">
      <MerchantHeader showTill={false} right={<Text style={s.headerAmount}>{formatMoney(payment.totalCents)}</Text>} />
      <View style={s.center}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
          <Waves />
          <View style={s.phone}>
            <View style={s.phoneScreen}>
              <Text style={s.phoneBiz}>{useSession.getState().profile?.merchant.name}</Text>
              <Text style={s.phoneAmount}>{formatMoney(payment.totalCents)}</Text>
              <View style={s.phoneBtn}>
                <Text style={s.phoneBtnText}>Approve</Text>
              </View>
            </View>
          </View>
        </View>
        <View style={{ marginTop: 28 }}>
          <Headline accent="your phone" size={26} center>
            Confirm on
          </Headline>
        </View>
        <Pill dot={colors.green} style={{ alignSelf: 'center', marginTop: 12 }}>
          {how}
        </Pill>
      </View>
      <View style={{ paddingHorizontal: 20, paddingBottom: 20, gap: 12 }}>
        <Steps steps={confirmationSteps(payment.status)} />
        <Button title="Cancel and re-arm" kind="ghost" onPress={() => useCheckout.getState().rearm()} testID="cancel-rearm" />
      </View>
    </Screen>
  );
}

function Waves() {
  return (
    <View style={{ width: 40, height: 80, justifyContent: 'center' }}>
      <Icon name="tap" size={44} color={colors.orange} />
    </View>
  );
}

// ---------- 20: Processing ----------

function Processing({ payment }: { payment: PaymentSession }) {
  return (
    <Screen glow="top">
      <MerchantHeader showTill={false} />
      <View style={s.center}>
        <View style={{ width: 160, height: 160, alignItems: 'center', justifyContent: 'center' }}>
          <View style={StyleSheet.absoluteFill}>
            <Spinner size={160} stroke={5} />
          </View>
          <View style={s.processingCore}>
            <Icon name="tap" size={36} color={colors.orange} strokeWidth={2.4} />
          </View>
        </View>
        <Text style={[s.bigAmount, { marginTop: 28 }]}>{formatMoney(payment.totalCents)}</Text>
        <Text style={s.processingTitle}>Confirming payment</Text>
        <T>Usually takes a couple of seconds.</T>
      </View>
      <View style={{ paddingHorizontal: 20, paddingBottom: 28 }}>
        <Steps steps={confirmationSteps(payment.status)} />
      </View>
    </Screen>
  );
}

// ---------- 21: Paid ----------

function Paid({ payment }: { payment: PaymentSession }) {
  const [deadline] = useState(() => Date.now() + AUTO_RETURN_SECONDS * 1000);
  const [paused, setPaused] = useState(false);
  const left = useCountdown(paused ? null : deadline);

  useEffect(() => {
    if (!paused && left <= 0) endSale();
  }, [left, paused]);

  return (
    <Screen background="orange">
      <MerchantHeader light tillDot={false} />
      <Text style={s.watermark} pointerEvents="none">
        PAID.
      </Text>
      <View style={s.center}>
        <Halo color="rgba(255,255,255,0.18)" size={140}>
          <View style={s.paidCheck}>
            <Icon name="check" size={48} color={colors.orange} strokeWidth={2.8} />
          </View>
        </Halo>
        <Text style={s.paidTitle} testID="paid-title">
          Paid
        </Text>
        <Text style={s.paidAmount}>{formatMoney(payment.totalCents)}</Text>
        <Text style={s.paidSub}>{methodLabel(payment.method)} · confirmed on Solana</Text>
      </View>
      <View style={{ paddingHorizontal: 20, paddingBottom: 16, gap: 12 }}>
        <Button
          title="Show receipt QR"
          kind="outlineOnOrange"
          onPress={() => {
            setPaused(true);
            router.push({ pathname: '/receipt/[paymentId]', params: { paymentId: payment.id } });
          }}
        />
        <Button title="New sale" kind="onOrange" onPress={endSale} testID="new-sale" />
        <Text style={s.paidFoot}>{paused ? 'Tap New sale when you’re done' : `Back to keypad in ${Math.ceil(left)}s`}</Text>
      </View>
    </Screen>
  );
}

// ---------- 22: Failed ----------

function Failed({ payment }: { payment: PaymentSession }) {
  const busy = useCheckout((s) => s.busy);
  return (
    <Screen>
      <MerchantHeader showTill={false} />
      <View style={s.center}>
        <Halo color={colors.redTint} size={100}>
          <View style={[s.outcomeBadge, { backgroundColor: colors.red }]}>
            <Icon name="close" size={30} color={colors.white} strokeWidth={2.8} />
          </View>
        </Halo>
        <Text style={s.outcomeTitle}>{"Payment didn't\ngo through"}</Text>
        <Text style={s.outcomeAmount}>{formatMoney(payment.totalCents)}</Text>
      </View>
      <View style={s.reason}>
        <T v="eyebrow">Reason</T>
        <Text style={s.reasonTitle}>{payment.failureReason ?? 'The payment could not be completed.'}</Text>
        <T v="small" style={{ marginTop: 4 }}>
          No money has moved. You can try again or the customer can pay another way.
        </T>
      </View>
      <View style={{ paddingHorizontal: 20, paddingBottom: 20, gap: 12 }}>
        <Button title="Try again" loading={busy} onPress={() => useCheckout.getState().rearm()} testID="try-again" />
        <Button title="Cancel sale" kind="secondary" onPress={endSale} testID="cancel-sale" />
      </View>
    </Screen>
  );
}

// ---------- 23: Expired ----------

function Expired({ payment }: { payment: PaymentSession }) {
  const busy = useCheckout((s) => s.busy);
  const lock = useSession((s) => s.profile?.settings.priceLockSeconds) ?? 90;
  const fromOrder = useCheckout((s) => (s.draft?.lines.some((l) => l.kind === 'item') ?? false) && s.draft?.source === 'terminal');
  return (
    <Screen>
      <MerchantHeader showTill={false} />
      <View style={s.center}>
        <Halo color={colors.amberTint} size={100}>
          <View style={[s.outcomeBadge, { backgroundColor: colors.amber }]}>
            <Icon name="clock" size={30} color={colors.amberInk} strokeWidth={2.4} />
          </View>
        </Halo>
        <Text style={s.outcomeTitle}>Price lock expired</Text>
        <Text style={s.outcomeAmount}>{formatMoney(payment.totalCents)}</Text>
        <T style={{ textAlign: 'center', paddingHorizontal: 28 }}>
          The customer didn’t pay within {lock} seconds, so the price was released. Nothing was charged.
        </T>
      </View>
      <View style={{ paddingHorizontal: 20, paddingBottom: 20, gap: 12 }}>
        <Button
          title={`Re-arm ${formatMoney(payment.totalCents)}`}
          loading={busy}
          onPress={() => useCheckout.getState().rearm()}
          testID="rearm"
        />
        {fromOrder ? (
          <Button
            title="Edit order"
            kind="secondary"
            onPress={() => {
              useCheckout.getState().finish(false);
              if (router.canDismiss()) router.dismissTo('/order');
              else router.replace('/order');
            }}
          />
        ) : null}
        <Pressable onPress={endSale} style={{ alignSelf: 'center', padding: 10 }} testID="expired-cancel">
          <Text style={s.link}>Cancel sale</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  armed: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  armedDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.orange,
    borderWidth: 2,
    borderColor: colors.orangeGlow,
  },
  armedText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.orangeDeep },
  armedBody: { flex: 1, paddingHorizontal: 20, gap: 14, justifyContent: 'center' },
  armedAmount: { fontFamily: fonts.displayHeavy, fontSize: 52, letterSpacing: -1, color: colors.ink },
  dashPill: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.ink,
    borderRadius: 999,
    height: 32,
    paddingHorizontal: 14,
  },
  dashPillText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.white },
  caption: { textAlign: 'center', color: colors.ink, fontSize: 14, lineHeight: 20 },
  headerAmount: { fontFamily: fonts.display, fontSize: 16, color: colors.ink },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, gap: 6 },
  phone: { width: 130, height: 240, borderRadius: 30, borderWidth: 8, borderColor: colors.ink, backgroundColor: colors.white, ...shadows.raised },
  phoneScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 10 },
  phoneBiz: { fontFamily: fonts.body, fontSize: 9, color: colors.muted },
  phoneAmount: { fontFamily: fonts.display, fontSize: 18, color: colors.ink },
  phoneBtn: { backgroundColor: colors.ink, borderRadius: 999, paddingVertical: 6, alignSelf: 'stretch', alignItems: 'center' },
  phoneBtnText: { fontFamily: fonts.bodySemi, fontSize: 9, color: colors.white },
  processingCore: { width: 100, height: 100, borderRadius: 50, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  bigAmount: { fontFamily: fonts.displayHeavy, fontSize: 40, color: colors.ink },
  processingTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.ink },
  watermark: {
    position: 'absolute',
    bottom: 150,
    left: -10,
    fontFamily: fonts.displayHeavy,
    fontSize: 120,
    color: 'rgba(255,255,255,0.08)',
    letterSpacing: -2,
  },
  paidCheck: { width: 108, height: 108, borderRadius: 54, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  paidTitle: { fontFamily: fonts.displayHeavy, fontSize: 64, color: colors.white, marginTop: 14 },
  paidAmount: { fontFamily: fonts.display, fontSize: 28, color: colors.white },
  paidSub: { fontFamily: fonts.body, fontSize: 15, color: 'rgba(255,255,255,0.88)', marginTop: 6 },
  paidFoot: { fontFamily: fonts.body, fontSize: 13, color: 'rgba(255,255,255,0.85)', textAlign: 'center' },
  outcomeBadge: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center' },
  outcomeTitle: { fontFamily: fonts.display, fontSize: 28, lineHeight: 33, color: colors.ink, textAlign: 'center', marginTop: 18 },
  outcomeAmount: { fontFamily: fonts.display, fontSize: 22, color: colors.ink, marginVertical: 8 },
  reason: { backgroundColor: colors.white, borderRadius: 20, padding: 18, marginHorizontal: 4, marginBottom: 80, gap: 4, ...shadows.card },
  reasonTitle: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.ink, marginTop: 4 },
  link: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.ink, textDecorationLine: 'underline' },
});
