/** Time helpers. All user-facing times are Asia/Bangkok (UTC+7, no DST). */

export const BKK_OFFSET_MS = 7 * 3600_000;
export const MIN = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;

/** Epoch ms for a Bangkok-local date (YYYY-MM-DD) and time (HH:MM). */
export function bkkTime(date: string, time = "00:00"): number {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return Date.UTC(y, m - 1, d, hh, mm) - BKK_OFFSET_MS;
}

/** Bangkok-local YYYY-MM-DD for an epoch. */
export function bkkDate(epoch: number): string {
  return new Date(epoch + BKK_OFFSET_MS).toISOString().slice(0, 10);
}

/** Bangkok-local HH:MM for an epoch. */
export function bkkHHMM(epoch: number): string {
  return new Date(epoch + BKK_OFFSET_MS).toISOString().slice(11, 16);
}

/** Seconds since Bangkok-local midnight of the day containing `epoch`. */
export function bkkSecOfDay(epoch: number): number {
  return Math.floor(((epoch + BKK_OFFSET_MS) % DAY) / 1000);
}

/** Bangkok-local midnight (epoch ms) of the day containing `epoch`. */
export function bkkMidnight(epoch: number): number {
  return epoch - (((epoch + BKK_OFFSET_MS) % DAY) + DAY) % DAY;
}

/** 0 = Monday … 6 = Sunday (GTFS calendar order). */
export function bkkWeekday(epoch: number): number {
  const js = new Date(epoch + BKK_OFFSET_MS).getUTCDay();
  return (js + 6) % 7;
}

export function hhmmToMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function addDays(date: string, days: number): string {
  return bkkDate(bkkTime(date) + days * DAY);
}

export function todayBkk(): string {
  return bkkDate(Date.now());
}

/** Round up to the next whole minute. */
export function ceilMin(epoch: number): number {
  return Math.ceil(epoch / MIN) * MIN;
}
