"use client";

import { ArrowRight, ChevronRight, Footprints, Repeat, TriangleAlert, Info, Ban } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { bkkDate } from "@/lib/time";
import type { Priority, Trip, Warning } from "@/lib/planner/types";
import { cn } from "@/lib/utils";
import { PriorityIcon } from "./icons";
import { CountUp } from "./count-up";
import { ModeIcon } from "./mode-icon";
import { Badge } from "./ui/primitives";
import { useFmt } from "./use-fmt";
import { WeatherChip } from "./weather";


export function WarningLine({ w, onAlternative }: { w: Warning; onAlternative?: (tripId: string) => void }) {
  const { msg } = useFmt();
  const t = useTranslations("plan");
  const Icon = w.level === "avoid" ? Ban : w.level === "caution" ? TriangleAlert : Info;
  const tone = w.level === "avoid" ? "bg-bad-soft text-bad" : w.level === "caution" ? "bg-warn-soft text-warn" : "bg-primary-soft text-primary";
  return (
    <div className={cn("flex items-start gap-2 rounded-xl px-3 py-2 text-sm", tone)} role={w.level === "avoid" ? "alert" : undefined}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0">
        <p className="font-medium">{msg(w.message)}</p>
        {w.alternative && (
          <p className="mt-0.5 font-semibold text-fg">
            {msg(w.alternative.message)}
            {w.alternative.tripId && onAlternative && (
              <button type="button" onClick={() => onAlternative(w.alternative!.tripId!)} className="ml-2 inline-flex min-h-8 items-center gap-1 rounded-lg bg-card px-2 text-xs font-bold text-primary underline-offset-2 hover:underline">
                {t("seeAlternative")} <ArrowRight className="size-3.5" aria-hidden />
              </button>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

export function TripCard({
  trip,
  tags,
  pax,
  href,
  compareOn,
  onCompare,
  onAlternative,
  highlight,
}: {
  trip: Trip;
  tags: Priority[];
  pax: number;
  href: string;
  compareOn: boolean;
  onCompare: (on: boolean) => void;
  onAlternative: (id: string) => void;
  highlight?: boolean;
}) {
  const t = useTranslations("plan");
  const tm = useTranslations("mode");
  const { price, time, dur } = useFmt();
  const rides = trip.legs.filter((l) => l.kind === "ride");
  const nextDay = bkkDate(trip.arrive) !== bkkDate(trip.depart);
  const weatherPoints = trip.legs.filter((l) => l.weather && (l.kind === "ride" || l.mode === "walk") && l.minutes >= 3).slice(0, 4);
  const shownWarnings = trip.warnings.filter((w) => w.level !== "info").slice(0, 2);
  const infoWarnings = trip.warnings.filter((w) => w.level === "info").slice(0, 1);
  return (
    <article
      id={`trip-${trip.id}`}
      className={cn("rounded-[18px] border bg-card p-4 shadow-soft transition-[transform,box-shadow,border-color] duration-200 ease-[var(--ease-soft)] hover:-translate-y-0.5 hover:shadow-lift md:p-5", highlight ? "border-primary ring-4 ring-ring" : "border-border hover:border-primary/25", trip.notRecommended && "opacity-90")}
      aria-label={`${time(trip.depart)}–${time(trip.arrive)}, ${price(trip.cost.amount * pax)}`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((p) => (
          <Badge key={p} tone={p === "cheapest" ? "good" : "primary"}>
            <PriorityIcon priority={p} className="size-3.5" /> {t(`priority.${p}`)}
          </Badge>
        ))}
        {trip.notRecommended && (
          <Badge tone="bad">
            <Ban aria-hidden /> {t("notRecommended")}
          </Badge>
        )}
        <label className="press ml-auto inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm text-muted hover:bg-subtle">
          <input type="checkbox" checked={compareOn} onChange={(e) => onCompare(e.target.checked)} className="size-4 accent-[var(--wf-primary)]" />
          {t("compare")}
        </label>
      </div>

      <div className="mt-3 grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
        <div className="min-w-0">
          <ol className="flex flex-wrap items-center gap-1" aria-label={rides.map((l) => tm(l.mode)).join(" → ")}>
            {rides.map((l, i) => (
              <li key={l.id} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="size-4 text-muted" aria-hidden />}
                <ModeIcon mode={l.mode} color={l.line?.color} className="size-8" />
                <span className="hidden text-xs font-medium text-muted sm:inline">{l.line?.short && l.mode !== "taxi" && l.mode !== "grab" ? l.line.short : tm(l.mode)}</span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-2xl font-bold tabular">
            {time(trip.depart)} <span className="text-muted">–</span> {time(trip.arrive)}
            {nextDay && <sup className="ml-1 text-xs font-semibold text-warn">{t("nextDay")}</sup>}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <span className="font-semibold text-fg">{dur(trip.minutes)}</span>
            <span className="inline-flex items-center gap-1">
              <Repeat className="size-4" aria-hidden />
              {t("transfers", { n: trip.transfers })}
            </span>
            {trip.walkMin > 0 && (
              <span className="inline-flex items-center gap-1">
                <Footprints className="size-4" aria-hidden />
                {t("walk", { min: trip.walkMin })}
              </span>
            )}
            <span>{t(`reliability.${trip.reliability.level}`, { min: trip.reliability.plusMinusMin })}</span>
          </p>
        </div>
        <div className="flex items-end justify-between gap-3 md:flex-col md:items-end">
          <div className="text-left md:text-right">
            <CountUp className="block text-3xl font-extrabold tracking-tight tabular text-fg" value={trip.cost.amount * pax} format={price} />
            <p className="text-xs text-muted tabular">
              {trip.cost.estimate ? t("range", { low: price(trip.cost.low * pax), high: price(trip.cost.high * pax) }) : null}
              {trip.cost.onChain > 0 ? ` · ${t("onChain")} ${price(trip.cost.onChain * pax)}` : ` · ${t("payOnSite")}`}
            </p>
          </div>
          <Link href={href} className="press inline-flex h-12 items-center gap-1 rounded-xl bg-primary px-4 text-sm font-semibold text-on-primary shadow-soft hover:bg-primary-strong hover:shadow-lift">
            {t("details")} <ChevronRight className="size-4" aria-hidden />
          </Link>
        </div>
      </div>

      {weatherPoints.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {weatherPoints.map((l) => (
            <span key={l.id} className="inline-flex items-center gap-1">
              <ModeIcon mode={l.mode} className="size-5 rounded-md" />
              <WeatherChip w={l.weather!} time={l.depart} />
            </span>
          ))}
        </div>
      )}
      {(shownWarnings.length > 0 || infoWarnings.length > 0) && (
        <div className="mt-3 space-y-2">
          {[...shownWarnings, ...infoWarnings].map((w, i) => (
            <WarningLine key={`${w.code}-${i}`} w={w} onAlternative={onAlternative} />
          ))}
        </div>
      )}
    </article>
  );
}
