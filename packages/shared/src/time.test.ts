import { describe, expect, it } from 'vitest';
import { startOfDayIn, todayAt } from './time';

describe('startOfDayIn', () => {
  it('starts the day at local midnight, not UTC midnight', () => {
    // 2026-11-02 01:30 UTC is 12:30pm in Melbourne (AEDT, UTC+11).
    const at = Date.UTC(2026, 10, 2, 1, 30);
    expect(new Date(startOfDayIn('Australia/Melbourne', at)).toISOString()).toBe('2026-11-01T13:00:00.000Z');
  });

  it('rolls over at local midnight', () => {
    // 2026-11-02 13:30 UTC is 00:30 on the 3rd in Melbourne.
    const at = Date.UTC(2026, 10, 2, 13, 30);
    expect(new Date(startOfDayIn('Australia/Melbourne', at)).toISOString()).toBe('2026-11-02T13:00:00.000Z');
  });

  it('uses the standard-time offset in winter', () => {
    const at = Date.UTC(2026, 5, 15, 4, 0); // AEST, UTC+10
    expect(new Date(startOfDayIn('Australia/Melbourne', at)).toISOString()).toBe('2026-06-14T14:00:00.000Z');
  });

  it('handles the daylight-saving changeover day', () => {
    // DST starts 2026-10-04 at 2am in Melbourne; midnight that day is still AEST (UTC+10).
    const at = Date.UTC(2026, 9, 4, 6, 0);
    expect(new Date(startOfDayIn('Australia/Melbourne', at)).toISOString()).toBe('2026-10-03T14:00:00.000Z');
  });

  it('works for UTC', () => {
    expect(startOfDayIn('UTC', Date.UTC(2026, 0, 1, 23, 59))).toBe(Date.UTC(2026, 0, 1));
  });

  it('builds wall-clock times today', () => {
    const at = Date.UTC(2026, 10, 2, 5, 0);
    expect(new Date(todayAt('Australia/Melbourne', 12, 40, at)).toISOString()).toBe('2026-11-02T01:40:00.000Z');
  });
});
