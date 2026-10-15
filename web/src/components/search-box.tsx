"use client";

import { ArrowLeftRight, Search, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { PlaceInput, type PlaceValue } from "./place-input";
import { Button } from "./ui/button";

export interface SearchInit {
  from?: PlaceValue | null;
  to?: PlaceValue | null;
  date?: string;
  time?: string;
  mode?: "depart" | "arrive";
  pax?: number;
}

const bkkNow = () => new Date(Date.now() + 7 * 3600_000);
const defaultDate = () => bkkNow().toISOString().slice(0, 10);
const defaultTime = () => {
  const d = bkkNow();
  const m = d.getUTCHours() * 60 + d.getUTCMinutes() + 30;
  const r = Math.ceil(m / 15) * 15;
  return `${String(Math.floor(r / 60) % 24).padStart(2, "0")}:${String(r % 60).padStart(2, "0")}`;
};

export function buildPlanUrl(v: { from: string; to: string; date: string; time: string; mode: string; pax: number; priority?: string; modes?: string }) {
  const p = new URLSearchParams({ from: v.from, to: v.to, date: v.date, time: v.time, mode: v.mode, pax: String(v.pax) });
  if (v.priority) p.set("priority", v.priority);
  if (v.modes) p.set("modes", v.modes);
  return `/plan?${p}`;
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
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!from) return setError(t("needFrom"));
    if (!to) return setError(t("needTo"));
    if (from.token === to.token) return setError(t("same"));
    setError(null);
    start(() => router.push(buildPlanUrl({ from: from.token, to: to.token, date: date || defaultDate(), time: time || defaultTime(), mode, pax, priority })));
  };

  return (
    <form onSubmit={submit} className={cn("rounded-2xl border border-border bg-card p-4 shadow-soft", compact ? "md:p-4" : "md:p-5")} aria-label={t("formLabel")}>
      <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-end">
        <PlaceInput label={t("from")} placeholder={t("fromPlaceholder")} value={from} onChange={setFrom} />
        <button
          type="button"
          onClick={() => {
            setFrom(to);
            setTo(from);
          }}
          className="mx-auto flex size-11 items-center justify-center rounded-full border border-border bg-card text-primary hover:bg-primary-soft md:mb-1.5"
          aria-label={t("swap")}
        >
          <ArrowLeftRight className="size-5 rotate-90 md:rotate-0" aria-hidden />
        </button>
        <PlaceInput label={t("to")} placeholder={t("toPlaceholder")} value={to} onChange={setTo} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-[auto_1fr_1fr_auto_auto] md:items-end">
        <fieldset className="col-span-2 md:col-span-1">
          <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{t("when")}</legend>
          <div className="inline-flex h-12 rounded-xl border border-border bg-bg p-1" role="radiogroup">
            {(["depart", "arrive"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                onClick={() => setMode(m)}
                className={cn("rounded-lg px-3 text-sm font-semibold", mode === m ? "bg-card text-primary shadow-soft" : "text-muted")}
              >
                {t(m)}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">{t("date")}</span>
          <input type="date" value={date} placeholder={defaultDate()} onChange={(e) => setDate(e.target.value)} className="h-12 w-full rounded-xl border border-border bg-card px-3 text-base" suppressHydrationWarning />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">{t("time")}</span>
          <input type="time" value={time} step={300} onChange={(e) => setTime(e.target.value)} className="h-12 w-full rounded-xl border border-border bg-card px-3 text-base" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">{t("pax")}</span>
          <span className="relative block">
            <Users className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <select value={pax} onChange={(e) => setPax(Number(e.target.value))} className="h-12 w-full appearance-none rounded-xl border border-border bg-card pl-9 pr-4 text-base md:w-24">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </span>
        </label>
        <Button type="submit" size="lg" disabled={pending} className="col-span-2 md:col-span-1 md:h-12">
          <Search aria-hidden />
          {pending ? t("searching") : t("submit")}
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm font-medium text-bad">
          {error}
        </p>
      )}
    </form>
  );
}
