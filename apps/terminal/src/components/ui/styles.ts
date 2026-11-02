import { StyleSheet } from 'react-native';
import { colors, fonts, radius, shadows } from '@/theme';

/**
 * Text never grows past this multiple of its design size. The terminal's layout is
 * fixed to one screen, so unlimited scaling would push buttons off it, but large-text
 * users still get a meaningful bump.
 */
export const MAX_FONT_SCALE = 1.3;

export const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
  button: {
    height: 60,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 24,
  },
  buttonDisabled: { backgroundColor: colors.disabled, shadowOpacity: 0, elevation: 0, borderWidth: 0 },
  buttonText: { fontFamily: fonts.bodySemi, fontSize: 18 },
  ghost: { alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 16 },
  ghostText: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.ink, textDecorationLine: 'underline' },
  iconButton: {
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  round: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(33,35,32,0.15)',
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 28,
    paddingHorizontal: 11,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  pillText: { fontFamily: fonts.bodyMedium, fontSize: 13 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontFamily: fonts.bodySemi, fontSize: 13 },
  card: { backgroundColor: colors.white, borderRadius: radius.card, padding: 16, ...shadows.card },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 16, paddingVertical: 12 },
  rowIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.fill, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontFamily: fonts.body, fontSize: 15, color: colors.ink },
  rowSub: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, marginTop: 2 },
  rowValue: { fontFamily: fonts.body, fontSize: 14, color: colors.muted },
});
