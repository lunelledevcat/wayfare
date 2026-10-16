"use client";

import { ChevronDown } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { clock, pick } from "@/lib/format";
import type { WeatherOverview } from "@/lib/planner/weather-summary";
import type { HourlyWeather, WeatherAt } from "@/lib/planner/types";
import { weatherRules } from "@/lib/config";
import { cn } from "@/lib/utils";
import { CloudIcon, HeatIcon, HeavyRainIcon, Pm25Icon, RainIcon, StormIcon, SunIcon, WindIcon, type Icon } from "./icons";

export function weatherIcon(w: Pick<WeatherAt, "code" | "precipProb"> & { precipMm?: number }): Icon {
  if (w.code >= 95) return StormIcon;
  if (w.code === 65 || w.code === 82 || (w.precipMm ?? 0) >= weatherRules.heavyRainMm) return HeavyRainIcon;
  if (w.code >= 51 || w.precipProb >= 35) return RainIcon;
  if (w.code >= 2) return CloudIcon;
  return SunIcon;
}

export function rainTone(prob: number) {
  return prob >= 60 ? "text-bad" : prob >= 35 ? "text-warn" : "text-good";
}

/** Small chip: icon + rain % + temperature (meaning not carried by colour alone). */
export function WeatherChip({ w, time, className }: { w: WeatherAt; time?: number; className?: string }) {
  const locale = useLocale();
  const t = useTranslations("plan.weather");
  const Icon = weatherIcon(w);
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-lg bg-bg px-2 py-1 text-xs font-medium tabular", className)} title={w.seasonal ? t("seasonal") : undefined}>
      {time !== undefined && <span className="text-muted">{clock(time, locale)}</span>}
      <Icon className={cn("size-4", rainTone(w.precipProb))} />
      <span className={rainTone(w.precipProb)}>{t("rain", { prob: Math.round(w.precipProb) })}</span>
      <span className="text-muted">{Math.round(w.tempC)}°</span>
      {w.gustKmh >= weatherRules.gustBoatKmh && <WindIcon className="size-4 text-warn" label={t("windy", { kmh: Math.round(w.gustKmh) })} />}
      {w.feelsC >= weatherRules.hotFeelsC && <HeatIcon className="size-4 text-bad" label={t("hot", { c: Math.round(w.feelsC) })} />}
      {(w.pm25 ?? 0) > weatherRules.pm25 && <Pm25Icon className="size-4 text-warn" label={t("pm25", { v: w.pm25 ?? 0 })} />}
    </span>
  );
}

/** Weather summary for one place over the travel window. */
export function WeatherSummary({ label, w, from, to }: { label: string; w: HourlyWeather; from: number; to: number }) {
  const locale = useLocale();
  const t = useTranslations("plan.weather");
  const hours = w.hours.filter((h) => h.time >= from - 3600_000 && h.time <= to);
  const shown = hours.filter((_, i) => i % Math.max(1, Math.ceil(hours.length / 6)) === 0).slice(0, 6);
  if (shown.length === 0) return null;
  const temps = hours.map((h) => h.tempC);
  const maxProb = Math.max(...hours.map((h) => h.precipProb));
  const Icon = weatherIcon({ code: Math.max(...hours.map((h) => h.code)), precipProb: maxProb });
  return (
    <div className="min-w-0 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <Icon className={cn("size-9", rainTone(maxProb))} />
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-muted">{label}</p>
          <p className="truncate font-semibold">{pick(w.place.name, locale)}</p>
          <p className="text-sm tabular">
            <span className={rainTone(maxProb)}>{t("rain", { prob: Math.round(maxProb) })}</span>
            <span className="text-muted"> · {t("temp", { min: Math.round(Math.min(...temps)), max: Math.round(Math.max(...temps)) })}</span>
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {shown.map((h) => (
          <WeatherChip key={h.time} w={h} time={h.time} />
        ))}
      </div>
      {!w.forecastAvailable && <p className="mt-2 text-xs text-warn">{t("seasonal")}</p>}
    </div>
  );
}

/**
 * One summary card for the travel window (average rain, temperature range, worst-hour icon),
 * with the hour-by-hour detail for both ends behind a "show hourly" button (closed by default).
 */
export function WeatherOverviewCard({ overview, origin, destination }: { overview: WeatherOverview; origin: HourlyWeather; destination: HourlyWeather }) {
  const locale = useLocale();
  const t = useTranslations("plan.weather");
  const [open, setOpen] = useState(false);
  const { all } = overview;
  const Icon = weatherIcon(all.worst);
  const temp = all.tempMin === all.tempMax ? t("tempOne", { t: all.tempMin }) : t("temp", { min: all.tempMin, max: all.tempMax });
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
      <div className="flex items-center gap-3">
        <Icon className={cn("size-10 shrink-0", rainTone(all.rain))} />
        <div className="min-w-0 flex-1">
          <p className="font-bold tabular">
            <span className={rainTone(all.rain)}>{t("avgRain", { prob: all.rain })}</span>
            <span className="text-muted"> · </span>
            {temp}
            <span className="text-muted"> · </span>
            <span className="whitespace-nowrap">{t("window", { from: clock(overview.from, locale), to: clock(overview.to, locale) })}</span>
          </p>
          <p className="mt-0.5 text-sm text-muted tabular">
            {t("origin")} {t("rain", { prob: overview.origin.rain })} · {t("destination")} {t("rain", { prob: overview.destination.rain })}
          </p>
        </div>
      </div>
      {overview.seasonal && <p className="mt-2 text-xs text-warn">{t("seasonal")}</p>}
      <button
        type="button"
        aria-expanded={open}
        aria-controls="wx-hourly"
        onClick={() => setOpen((o) => !o)}
        className="press mt-3 inline-flex min-h-12 items-center gap-1 rounded-xl px-3 text-sm font-semibold text-primary hover:bg-primary-soft focus-visible:ring-4 focus-visible:ring-ring"
      >
        {open ? t("hideHourly") : t("showHourly")}
        <ChevronDown className={cn("size-4 transition-transform duration-200", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div id="wx-hourly" className="mt-2 grid animate-pop-in gap-3 md:grid-cols-2">
          <WeatherSummary label={t("origin")} w={origin} from={overview.from} to={overview.from + 4 * 3600_000} />
          <WeatherSummary label={t("destination")} w={destination} from={Math.max(overview.from, overview.to - 4 * 3600_000)} to={overview.to} />
        </div>
      )}
    </div>
  );
}
