import { Stack } from 'expo-router';
import { colors } from '@/theme';

export default function TabStack() {
  return <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right', contentStyle: { backgroundColor: colors.bg } }} />;
}
