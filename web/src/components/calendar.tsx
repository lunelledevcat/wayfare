"use client";

import "react-day-picker/style.css";
import { enUS, ja, th, zhCN, type Locale as DateLocale } from "date-fns/locale";
import { DayPicker } from "react-day-picker";

const DATE_LOCALES: Record<string, DateLocale> = { th, en: enUS, zh: zhCN, ja };

/** Month calendar (react-day-picker), loaded on demand when the date popover opens. */
export default function Calendar({ locale, selected, onSelect, from, to }: { locale: string; selected: Date; onSelect: (d: Date) => void; from: Date; to: Date }) {
  return (
    <DayPicker
      mode="single"
      required
      locale={DATE_LOCALES[locale] ?? enUS}
      selected={selected}
      defaultMonth={selected}
      onSelect={(d) => d && onSelect(d)}
      disabled={{ before: from }}
      startMonth={from}
      endMonth={to}
      className="wf-calendar"
    />
  );
}
