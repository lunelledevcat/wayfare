"use client";

import { TrendingDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { dayLabel } from "@/lib/format";
import type { Mode, PriceDay } from "@/lib/planner/types";
import { bkkTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useFmt } from "./use-fmt";

/** 7-day price bars around the chosen date, with a "cheaper on…" hint. Plain SVG/CSS, no chart library. */
export default function PriceChart({ days, selected, reference, pax, hrefFor }: { days: PriceDay[]; selected: string; reference: Mode; pax: number; hrefFor: (date: string) => string }) {
  const t = useTranslations("plan.calendar");
  const tm = useTranslations("mode");
  const { price, locale } = useFmt();
  const vals = days.map((d) => d.amount).filter((x): x is number => x !== null);
  if (vals.length === 0) return null;
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  const sel = days.find((d) => d.date === selected)?.amount ?? null;
  const cheapest = days.filter((d) => d.amount !== null).sort((a, b) => a.amount! - b.amount!)[0];
  const saving = sel !== null && cheapest && cheapest.date !== selected ? (sel - cheapest.amount!) * pax : 0;
  const allSame = max === min;
  return (
    <section className="rounded-2xl border border-border bg-card p-4" aria-labelledby="price-cal">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="price-cal" className="font-bold">
          {t("title")}
        </h2>
        <p className="text-xs text-muted">{t("reference", { mode: tm(reference) })}</p>
      </div>
      <div className="mt-4 grid grid-cols-7 items-end gap-1.5" style={{ height: 150 }}>
        {days.map((d) => {
          const h = d.amount === null ? 6 : allSame ? 70 : 24 + ((d.amount - min) / (max - min)) * 76;
          const isSel = d.date === selected;
          const isMin = d.amount !== null && d.amount === min && !allSame;
          return (
            <Link
              key={d.date}
              href={hrefFor(d.date)}
              className="group flex h-full flex-col items-center justify-end gap-1 rounded-lg focus-visible:outline-none"
              aria-label={`${dayLabel(bkkTime(d.date), locale, { weekday: "long", day: "numeric", month: "short" })}: ${d.amount === null ? t("na") : price(d.amount * pax)}`}
              aria-current={isSel ? "date" : undefined}
            >
              <span className={cn("text-[11px] font-semibold tabular", isMin ? "text-good" : "text-muted")}>{d.amount === null ? t("na") : price(d.amount * pax)}</span>
              <span
                className={cn("w-full rounded-t-lg transition-colors", isSel ? "bg-primary" : isMin ? "bg-good" : "bg-primary/25 group-hover:bg-primary/45", d.amount === null && "bg-border")}
                style={{ height: `${h}%` }}
              />
              <span className={cn("text-xs", isSel ? "font-bold text-primary" : "text-muted")}>{dayLabel(bkkTime(d.date), locale, { weekday: "short", day: "numeric" })}</span>
              {d.holiday && <span className="text-[10px] font-semibold text-warn">{t("holiday")}</span>}
            </Link>
          );
        })}
      </div>
      <p className={cn("mt-3 flex items-center gap-2 text-sm font-semibold", saving > 0 ? "text-good" : "text-muted")}>
        <TrendingDown className="size-4" aria-hidden />
        {saving > 0 ? t("cheaperOn", { day: dayLabel(bkkTime(cheapest!.date), locale, { weekday: "long" }), price: price(saving) }) : t("bestDay")}
      </p>
    </section>
  );
}
