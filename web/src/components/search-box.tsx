"use client";

import { ArrowLeftRight, Minus, Plus, Search } from "lucide-react";
import * as m from "motion/react-m";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { CAR_DEFAULTS, carToParams, normalizeCar, type CarOptions } from "@/lib/car";
import { todayBkk } from "@/lib/time";
import { cn } from "@/lib/utils";
import { CarOptionsField } from "./car-options";
import { DateField } from "./date-field";
import { PlaceInput, type PlaceValue } from "./place-input";
import { nowBkk, TimeField } from "./time-field";
import { Button } from "./ui/button";
import { SPRING } from "./ui/motion";
import { Segmented } from "./ui/segmented";

export interface SearchInit {
  from?: PlaceValue | null;
  to?: PlaceValue | null;
  date?: string;
  time?: string;
  mode?: "depart" | "arrive";
  pax?: number;
  /** car options of the current plan (from the URL); when absent they come from localStorage */
  car?: CarOptions;
}

/** Default departure: 30 minutes from now, rounded to 15. */
const CAR_KEY = "wayfare.car.v1";
const defaultTime = () => {
  const [h, mm] = nowBkk().split(":").map(Number);
  const r = Math.ceil((h * 60 + mm + 30) / 15) * 15;
  return `${String(Math.floor(r / 60) % 24).padStart(2, "0")}:${String(r % 60).padStart(2, "0")}`;
};

export function buildPlanUrl(v: { from: string; to: string; date: string; time: string; mode: string; pax: number; priority?: string; modes?: string; car?: CarOptions }) {
  const p = new URLSearchParams({ from: v.from, to: v.to, date: v.date, time: v.time, mode: v.mode, pax: String(v.pax) });
  if (v.car) for (const [k, val] of Object.entries(carToParams(v.car))) p.set(k, val);
  if (v.priority) p.set("priority", v.priority);
  if (v.modes) p.set("modes", v.modes);
  return `/plan?${p}`;
}

function PaxStepper({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  const t = useTranslations("search");
  return (
    <div>
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">{label}</span>
      <div className="flex h-14 items-center justify-between rounded-xl border border-border bg-card px-1.5" role="group" aria-label={label}>
        <button type="button" onClick={() => onChange(Math.max(1, value - 1))} disabled={value <= 1} aria-label={t("paxDec")} className="press flex size-11 items-center justify-center rounded-lg text-primary hover:bg-primary-soft disabled:text-muted disabled:opacity-40">
          <Minus className="size-5" aria-hidden />
        </button>
        <output aria-live="polite" className="min-w-8 text-center text-xl font-bold tabular">
          {value}
        </output>
        <button type="button" onClick={() => onChange(Math.min(9, value + 1))} disabled={value >= 9} aria-label={t("paxInc")} className="press flex size-11 items-center justify-center rounded-lg text-primary hover:bg-primary-soft disabled:text-muted disabled:opacity-40">
          <Plus className="size-5" aria-hidden />
        </button>
      </div>
    </div>
  );
}

export function SearchBox({ init, compact = false, priority }: { init?: SearchInit; compact?: boolean; priority?: string }) {
  const t = useTranslations("search");
  const router = useRouter();
  const [from, setFrom] = useState<PlaceValue | null>(init?.from ?? null);
  const [to, setTo] = useState<PlaceValue | null>(init?.to ?? null);
  const [date, setDate] = useState(init?.date ?? "");
  const [time, setTime] = useState(init?.time ?? "");
  const [mode, setMode] = useState<"depart" | "arrive">(init?.mode ?? "depart");
  const [pax, setPax] = useState(init?.pax ?? 1);
  const [car, setCarState] = useState<CarOptions>(init?.car ?? CAR_DEFAULTS);
  const [error, setError] = useState<string | null>(null);
  const [turns, setTurns] = useState(0);
  const [pending, start] = useTransition();

  // static pages are prerendered: fill "today" and "soon" on the client
  useEffect(() => {
    setDate((d) => d || todayBkk());
    setTime((x) => x || defaultTime());
    // remembered car settings (only when the URL did not carry any)
    if (!init?.car) {
      try {
        const saved = localStorage.getItem(CAR_KEY);
        if (saved) setCarState(normalizeCar(JSON.parse(saved)));
      } catch {
        /* storage unavailable or corrupt: keep defaults */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setCar = (c: CarOptions) => {
    setCarState(c);
    try {
      localStorage.setItem(CAR_KEY, JSON.stringify(c));
    } catch {
      /* storage unavailable */
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!from) return setError(t("needFrom"));
    if (!to) return setError(t("needTo"));
    if (from.token === to.token) return setError(t("same"));
    setError(null);
    start(() => router.push(buildPlanUrl({ from: from.token, to: to.token, date: date || todayBkk(), time: time || defaultTime(), mode, pax, priority, car })));
  };

  return (
    <form
      onSubmit={submit}
      aria-label={t("formLabel")}
      className={cn("rounded-[20px] border border-border bg-elevated shadow-lift", compact ? "p-4" : "p-4 md:p-6")}
    >
      <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-end">
        <PlaceInput label={t("from")} placeholder={t("fromPlaceholder")} value={from} onChange={setFrom} locate />
        <m.button
          type="button"
          onClick={() => {
            setFrom(to);
            setTo(from);
            setTurns((n) => n + 1);
          }}
          animate={{ rotate: turns * 180 }}
          transition={SPRING}
          whileTap={{ scale: 0.92 }}
          className="mx-auto flex size-12 items-center justify-center rounded-full border border-border bg-card text-primary shadow-soft hover:bg-primary-soft focus-visible:ring-4 focus-visible:ring-ring md:mb-1"
          aria-label={t("swap")}
        >
          <ArrowLeftRight className="size-5 rotate-90 md:rotate-0" aria-hidden />
        </m.button>
        <PlaceInput label={t("to")} placeholder={t("toPlaceholder")} value={to} onChange={setTo} />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(220px,auto)_1fr_1fr_auto]">
        <div className="sm:col-span-2 lg:col-span-1">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">{t("when")}</span>
          <Segmented
            ariaLabel={t("when")}
            value={mode}
            onChange={setMode}
            size="lg"
            className="h-14 [&_button]:min-h-0"
            options={[
              { value: "depart", label: t("depart") },
              { value: "arrive", label: t("arrive") },
            ]}
          />
        </div>
        {date ? <DateField label={t("date")} value={date} onChange={setDate} /> : <div className="h-[78px]" aria-hidden />}
        <TimeField label={mode === "arrive" ? t("arriveTime") : t("time")} value={time} onChange={setTime} />
        <PaxStepper label={t("pax")} value={pax} onChange={setPax} />
      </div>

      <div className="mt-4">
        <CarOptionsField value={car} onChange={setCar} />
      </div>

      <Button type="submit" size="lg" disabled={pending} className="mt-4 w-full text-lg">
        <Search aria-hidden />
        {pending ? t("searching") : t("submit")}
      </Button>
      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-bad-soft px-3 py-2 text-sm font-medium text-bad">
          {error}
        </p>
      )}
    </form>
  );
}
