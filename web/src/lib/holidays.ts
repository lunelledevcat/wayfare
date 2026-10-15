import data from "../../data/holidays-th-2026.json";
import { addDays, bkkTime, bkkWeekday } from "./time";

const holidaySet = new Set(data.holidays.map((h) => h.date));

export function isHoliday(date: string): boolean {
  return holidaySet.has(date);
}

/** A public holiday, or a weekend day that forms a long weekend with one. */
export function isHolidayPeriod(date: string): boolean {
  if (holidaySet.has(date)) return true;
  const wd = bkkWeekday(bkkTime(date));
  if (wd < 5) return false;
  // walk to the edges of this weekend and check the neighbouring weekdays
  const before = addDays(date, -(wd - 4)); // Friday
  const after = addDays(date, 7 - wd); // Monday
  return holidaySet.has(before) || holidaySet.has(after);
}

export function holidayName(date: string): { th: string; en: string } | null {
  const h = data.holidays.find((x) => x.date === date);
  return h ? { th: h.th, en: h.en } : null;
}

export const holidaySource = { name: data.source, url: data.sourceUrl, checkedAt: data.checkedAt };
