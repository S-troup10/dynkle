import { useEffect, useState } from 'react';

/** Seconds left until `until` (ISO string or epoch ms), re-rendering every 250ms while it runs. */
export function useCountdown(until: string | number | null | undefined): number {
  const target = until == null ? null : typeof until === 'number' ? until : Date.parse(until);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (target == null) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 250);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [target]);
  return target == null ? 0 : Math.max(0, (target - now) / 1000);
}
