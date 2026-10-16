"use client";

import { ChevronDown, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { CAR_DEFAULTS, isDefaultCar, normalizeCar, type CarOptions } from "@/lib/car";
import { cn } from "@/lib/utils";
import { SwitchRow } from "./chips";
import { CarIcon } from "./icons";

function NumberField({ label, unit, value, min, max, step, onCommit }: { label: string; unit: string; value: number; min: number; max: number; step: number; onCommit: (n: number) => void }) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold text-muted">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          value={draft ?? String(value)}
          onChange={(e) => {
            setDraft(e.target.value);
            if (e.target.value !== "" && Number.isFinite(Number(e.target.value))) onCommit(Number(e.target.value));
          }}
          onBlur={() => setDraft(null)}
          className="h-12 w-full rounded-xl border border-border bg-card pl-3 pr-14 text-base font-semibold tabular hover:border-primary/40 focus:border-primary focus:outline-none focus:ring-4 focus:ring-ring"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">{unit}</span>
      </div>
    </div>
  );
}

/**
 * "I have a car" switch plus a collapsible panel of editable car and rental costs.
 * Values are normalised (clamped) on every change; the parent keeps them in state, the URL and localStorage.
 */
export function CarOptionsField({ value, onChange }: { value: CarOptions; onChange: (c: CarOptions) => void }) {
  const t = useTranslations("search.car");
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const set = (patch: Partial<CarOptions>) => onChange(normalizeCar({ ...value, ...patch }));
  return (
    <div className="space-y-2">
      <SwitchRow on={value.own} onChange={(own) => set({ own })} label={t("own")} hint={t("ownHint")} />
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="press flex min-h-12 w-full items-center gap-2 rounded-xl border border-border bg-card px-3 text-left text-sm font-semibold hover:bg-subtle focus-visible:ring-4 focus-visible:ring-ring"
      >
        <CarIcon className="size-5 text-primary" />
        <span className="flex-1">{t("panel")}</span>
        {!isDefaultCar({ ...value, own: false }) && <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs text-primary">{t("edited")}</span>}
        <ChevronDown className={cn("size-4 text-muted transition-transform duration-200", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div id={panelId} className="animate-pop-in space-y-4 rounded-xl border border-border bg-subtle p-3">
          <div className="grid grid-cols-2 gap-3">
            <NumberField label={t("kmPerL")} unit={t("unitKmPerL")} value={value.kmPerL} min={3} max={40} step={0.5} onCommit={(kmPerL) => set({ kmPerL })} />
            <NumberField label={t("fuelPrice")} unit={t("unitBahtPerL")} value={value.fuelPrice} min={10} max={100} step={0.5} onCommit={(fuelPrice) => set({ fuelPrice })} />
            <NumberField label={t("parking")} unit="฿" value={value.parking} min={0} max={2000} step={10} onCommit={(parking) => set({ parking })} />
            <NumberField label={t("rentDays")} unit={t("unitDays")} value={value.rentDays} min={1} max={30} step={1} onCommit={(rentDays) => set({ rentDays })} />
          </div>
          <SwitchRow on={value.tolls} onChange={(tolls) => set({ tolls })} label={t("tolls")} hint={t("tollsHint")} />
          <p className="text-xs text-muted">{t("note")}</p>
          <button
            type="button"
            onClick={() => onChange({ ...CAR_DEFAULTS, own: value.own })}
            className="press inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-primary hover:bg-primary-soft"
          >
            <RotateCcw className="size-4" aria-hidden /> {t("reset")}
          </button>
        </div>
      )}
    </div>
  );
}
