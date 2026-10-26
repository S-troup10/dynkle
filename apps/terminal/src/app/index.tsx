import { Redirect } from 'expo-router';
import { useSession } from '@/state/session';

export default function Index() {
  const phase = useSession((s) => s.phase);
  if (phase === 'paired') return <Redirect href="/keypad" />;
  if (phase === 'unpaired') return <Redirect href="/unpaired" />;
  return <Redirect href="/welcome" />;
}
