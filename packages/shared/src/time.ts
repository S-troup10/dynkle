/** Offset of `timeZone` from UTC at instant `at`, in ms (e.g. +11h for Melbourne in summer). */
function zoneOffsetMs(at: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(at));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const wallClockAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return wallClockAsUtc - Math.floor(at / 1000) * 1000;
}

/**
 * Midnight at the start of the day containing `at`, in the merchant's time zone,
 * as a UTC timestamp. Servers run in UTC, so `setHours(0)` would start an
 * Australian merchant's "today" at 10 or 11am.
 */
export function startOfDayIn(timeZone: string, at: number = Date.now()): number {
  const local = new Date(at + zoneOffsetMs(at, timeZone));
  const midnightWallClock = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  // Use the offset in force at midnight itself, which differs on daylight-saving changeover days.
  let start = midnightWallClock - zoneOffsetMs(midnightWallClock, timeZone);
  start = midnightWallClock - zoneOffsetMs(start, timeZone);
  return start;
}

/** A wall-clock time today (hours, minutes) in the merchant's time zone, as a UTC timestamp. */
export function todayAt(timeZone: string, hours: number, minutes: number, at: number = Date.now()): number {
  return startOfDayIn(timeZone, at) + hours * 3_600_000 + minutes * 60_000;
}
