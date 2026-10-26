import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon, type IconName } from '@/components/Icon';
import { Button, Headline, Screen, T } from '@/components/ui';
import { colors, fonts, gradients, shadows } from '@/theme';

const STEPS = [
  {
    title: 'Ring up',
    accent: 'any sale.',
    body: 'Type in an amount, or tap items from your menu. Your menu syncs from the merchant dashboard.',
    art: <TerminalArt />,
  },
  {
    title: 'Customers pay',
    accent: 'their way.',
    body: 'They tap, scan the QR code, or connect with the DYNK app. Phantom, Solflare and Backpack work too.',
    art: <MethodsArt />,
  },
  {
    title: 'Paid in',
    accent: 'seconds.',
    body: 'Payments confirm on chain and land straight in your business wallet. No waiting days for settlement.',
    art: <PaidArt />,
  },
];

export default function Intro() {
  const [step, setStep] = useState(0);
  const [width, setWidth] = useState(0);
  const scroller = useRef<ScrollView>(null);
  const last = step === STEPS.length - 1;

  const go = (i: number) => {
    setStep(i);
    scroller.current?.scrollTo({ x: i * width, animated: true });
  };
  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width) setStep(Math.round(e.nativeEvent.contentOffset.x / width));
  };
  const finish = () => router.push('/network');

  return (
    <Screen glow="top">
      <View style={s.top}>
        <Pressable onPress={finish} hitSlop={12} testID="skip">
          <Text style={s.skip}>Skip</Text>
        </Pressable>
      </View>
      <View style={{ flex: 1 }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 ? (
          <ScrollView
            ref={scroller}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onScrollEnd}
          >
            {STEPS.map((st, i) => (
              <View key={i} style={{ width, paddingHorizontal: 24 }}>
                <View style={s.art}>{st.art}</View>
                <Text style={s.eyebrow}>{`STEP 0${i + 1} / 03`}</Text>
                <Headline accent={st.accent} size={30}>
                  {st.title}
                </Headline>
                <T style={s.body}>{st.body}</T>
              </View>
            ))}
          </ScrollView>
        ) : null}
      </View>
      <View style={s.footer}>
        <Button
          title={last ? 'Set up terminal' : 'Next'}
          trailingArrow
          onPress={() => (last ? finish() : go(step + 1))}
          testID="intro-next"
        />
      </View>
    </Screen>
  );
}

function TerminalArt() {
  return (
    <View style={[a.device, { width: 250 }]}>
      <View style={a.screen}>
        <View style={a.rowBetween}>
          <Text style={a.biz}>Dynkle Café</Text>
          <View style={a.miniPill}>
            <Text style={a.miniPillText}>Till 1</Text>
          </View>
        </View>
        <Text style={a.amount}>$12.50</Text>
        <View style={a.keys}>
          {['1', '2', '3', '4', '5', '6'].map((k) => (
            <View key={k} style={a.key}>
              <Text style={a.keyText}>{k}</Text>
            </View>
          ))}
        </View>
        <View style={a.charge}>
          <Text style={a.chargeText}>Charge</Text>
        </View>
      </View>
    </View>
  );
}

function MethodsArt() {
  const items: [IconName, string][] = [
    ['tap', 'TAP'],
    ['scan', 'SCAN'],
    ['bluetooth', 'CONNECT'],
  ];
  return (
    <View style={{ flexDirection: 'row', gap: 24 }}>
      {items.map(([icon, label]) => (
        <View key={label} style={{ alignItems: 'center', gap: 14 }}>
          <View style={a.methodCircle}>
            <Icon name={icon} size={28} color={colors.orange} />
          </View>
          <Text style={a.methodLabel}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

function PaidArt() {
  return (
    <View style={[a.device, { width: 270, padding: 8 }]}>
      <LinearGradient colors={gradients.orange} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={a.paidCard}>
        <View style={a.paidCheck}>
          <Icon name="check" size={24} color={colors.orange} strokeWidth={2.6} />
        </View>
        <Text style={a.paidText}>Paid</Text>
        <Text style={a.paidSub}>$12.50 · confirmed on Solana</Text>
      </LinearGradient>
    </View>
  );
}

const s = StyleSheet.create({
  top: { height: 56, alignItems: 'flex-end', justifyContent: 'center', paddingHorizontal: 24 },
  skip: { fontFamily: fonts.bodyMedium, fontSize: 16, color: colors.ink },
  art: { height: 340, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontFamily: fonts.bodyMedium, fontSize: 12, letterSpacing: 2, color: colors.muted, marginBottom: 12 },
  body: { fontSize: 16, lineHeight: 25, marginTop: 14 },
  footer: { paddingHorizontal: 24, paddingBottom: 24 },
});

const a = StyleSheet.create({
  device: { borderRadius: 28, borderWidth: 8, borderColor: colors.ink, backgroundColor: colors.white, ...shadows.raised },
  screen: { padding: 16, gap: 10 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  biz: { fontFamily: fonts.display, fontSize: 11, color: colors.ink },
  miniPill: { backgroundColor: colors.fill, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  miniPillText: { fontFamily: fonts.body, fontSize: 9, color: colors.ink },
  amount: { fontFamily: fonts.displayHeavy, fontSize: 30, color: colors.ink },
  keys: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  key: { width: '31%', flexGrow: 1, height: 34, borderRadius: 8, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  keyText: { fontFamily: fonts.display, fontSize: 13, color: colors.ink },
  charge: { height: 38, borderRadius: 999, backgroundColor: colors.orange, alignItems: 'center', justifyContent: 'center' },
  chargeText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.white },
  methodCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  methodLabel: { fontFamily: fonts.bodySemi, fontSize: 13, letterSpacing: 1.5, color: colors.ink },
  paidCard: { borderRadius: 20, height: 190, alignItems: 'center', justifyContent: 'center', gap: 6 },
  paidCheck: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  paidText: { fontFamily: fonts.displayHeavy, fontSize: 30, color: colors.white },
  paidSub: { fontFamily: fonts.body, fontSize: 12, color: colors.white },
});
