"use client";

import { CalendarDays } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState } from "react";
import dynamic from "next/dynamic";
import { dayLabel } from "@/lib/format";
import { addDays, bkkTime, bkkWeekday, todayBkk } from "@/lib/time";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Skeleton } from "./ui/primitives";

const Calendar = dynamic(() => import("./calendar"), { ssr: false, loading: () => <Skeleton className="h-[340px] w-[308px]" /> });

/** YYYY-MM-DD ⇄ local-midnight Date for the calendar widget. */
const toDate = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const toYmd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Calendar date picker in a popover, with Today / Tomorrow / This Friday shortcuts. */
export function DateField({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const t = useTranslations("search");
  const locale = useLocale();
  const id = useId();
  const [open, setOpen] = useState(false);
  const today = todayBkk();
  const friday = addDays(today, (4 - bkkWeekday(bkkTime(today)) + 7) % 7);
  const shortcuts = [
    { k: "today", v: today },
    { k: "tomorrow", v: addDays(today, 1) },
    { k: "friday", v: friday },
  ];
  const choose = (v: string) => {
    onChange(v);
    setOpen(false);
  };
  return (
    <div>
      <span id={id} className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          aria-labelledby={id}
          aria-describedby={`${id}-v`}
          className="press flex h-14 w-full items-center gap-3 rounded-xl border border-border bg-card px-4 text-left hover:border-primary/40 focus-visible:border-primary data-[state=open]:border-primary"
        >
          <CalendarDays className="size-5 shrink-0 text-primary" aria-hidden />
          <span id={`${id}-v`} className="min-w-0 truncate text-base font-semibold">
            {dayLabel(bkkTime(value), locale, { weekday: "short", day: "numeric", month: "short" })}
          </span>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3">
          <div className="mb-2 grid grid-cols-3 gap-2">
            {shortcuts.map((s) => (
              <button
                key={s.k}
                type="button"
                onClick={() => choose(s.v)}
                className={cn("press min-h-11 rounded-xl px-2 text-sm font-semibold", value === s.v ? "bg-primary text-on-primary" : "bg-primary-soft text-primary hover:bg-primary/20")}
              >
                {t(`datePicker.${s.k}`)}
              </button>
            ))}
          </div>
          <Calendar locale={locale} selected={toDate(value)} onSelect={(d) => choose(toYmd(d))} from={toDate(today)} to={toDate(addDays(today, 365))} />
        </PopoverContent>
      </Popover>
    </div>
  );
}
