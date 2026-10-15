"use client";

import { Cloud, CloudDrizzle, CloudLightning, CloudRain, CloudSun, Sun, type LucideIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { clock, pick } from "@/lib/format";
import type { HourlyWeather, WeatherAt } from "@/lib/planner/types";
import { cn } from "@/lib/utils";

export function weatherIcon(w: Pick<WeatherAt, "code" | "precipProb">): LucideIcon {
  if (w.code >= 95) return CloudLightning;
  if (w.code >= 61 || w.precipProb >= 60) return CloudRain;
  if (w.code >= 51 || w.precipProb >= 35) return CloudDrizzle;
  if (w.code >= 3) return Cloud;
  if (w.code >= 1) return CloudSun;
  return Sun;
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
      <Icon className={cn("size-4", rainTone(w.precipProb))} aria-hidden />
      <span className={rainTone(w.precipProb)}>{t("rain", { prob: Math.round(w.precipProb) })}</span>
      <span className="text-muted">{Math.round(w.tempC)}°</span>
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
        <Icon className={cn("size-9", rainTone(maxProb))} aria-hidden />
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
