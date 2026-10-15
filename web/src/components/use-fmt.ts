"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback } from "react";
import { clock, money, renderMsg, splitDuration } from "@/lib/format";
import type { MsgRef } from "@/lib/planner/types";
import { usePrefs } from "./prefs";

/** Formatting helpers bound to the current locale and display currency. */
export function useFmt() {
  const locale = useLocale();
  const { prefs } = usePrefs();
  const tc = useTranslations("common");
  const tm = useTranslations("msg");
  const price = useCallback((thb: number) => money(thb, locale, prefs.currency), [locale, prefs.currency]);
  const time = useCallback((epoch: number) => clock(epoch, locale), [locale]);
  const dur = useCallback((min: number) => tc("duration", splitDuration(min)), [tc]);
  const msg = useCallback((ref: MsgRef) => renderMsg(tm as never, ref, locale, prefs.currency), [tm, locale, prefs.currency]);
  return { locale, currency: prefs.currency, price, time, dur, msg };
}
