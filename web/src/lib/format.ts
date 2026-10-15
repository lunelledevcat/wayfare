import { currencyRates, THB_PER_USDC, type DisplayCurrency } from "./config";
import type { LocalizedText, MsgRef } from "./planner/types";

const intlLocale: Record<string, string> = { th: "th-TH", en: "en-GB", zh: "zh-CN", ja: "ja-JP" };
export const toIntl = (locale: string) => intlLocale[locale] ?? "en-GB";

/** Pick the right language from a localized name, falling back to English. */
export function pick(t: LocalizedText | undefined, locale: string): string {
  if (!t) return "";
  return (t as Record<string, string | undefined>)[locale] || t.en || t.th;
}

export function money(thb: number, locale: string, currency: DisplayCurrency = "THB"): string {
  const value = thb * currencyRates[currency];
  return new Intl.NumberFormat(toIntl(locale), {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "THB" || currency === "JPY" ? 0 : 2,
    minimumFractionDigits: 0,
  }).format(value);
}

export function usdc(thb: number): string {
  return (thb / THB_PER_USDC).toFixed(2);
}

export function clock(epoch: number, locale: string): string {
  return new Intl.DateTimeFormat(toIntl(locale), { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Bangkok" }).format(epoch);
}

export function dayLabel(epoch: number, locale: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }): string {
  return new Intl.DateTimeFormat(toIntl(locale), { ...opts, timeZone: "Asia/Bangkok" }).format(epoch);
}

/** "2 h 15 min" style via messages: returns {h, m}. */
export function splitDuration(min: number) {
  const m = Math.max(0, Math.round(min));
  return { h: Math.floor(m / 60), m: m % 60 };
}

type Translator = (key: string, values?: Record<string, string | number>) => string;

/** Resolve a planner MsgRef with the "msg" translator. Localized params are picked and numbers formatted. */
export function renderMsg(t: Translator, ref: MsgRef, locale: string, currency: DisplayCurrency = "THB"): string {
  const values: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(ref.params ?? {})) {
    if (typeof v === "object") values[k] = pick(v, locale);
    else if (typeof v === "number" && (k === "price" || k === "delta")) values[k] = money(v, locale, currency);
    else values[k] = v;
  }
  try {
    return t(ref.key, values);
  } catch {
    return ref.key;
  }
}
