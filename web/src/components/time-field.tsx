"use client";

import { Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { TimeWheelPicker } from "./TimeWheelPicker";
import { Popover, PopoverAnchor, PopoverContent } from "./ui/popover";

const pad = (n: number) => String(n).padStart(2, "0");
const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const fromMin = (min: number) => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
};
/** Current Bangkok time rounded up to 5 minutes. */
export const nowBkk = () => {
  const d = new Date(Date.now() + 7 * 3600_000);
  return fromMin(Math.ceil((d.getUTCHours() * 60 + d.getUTCMinutes()) / 5) * 5);
};

/** "930" → "09:30", "0930" → "09:30", "9" → "09:00"; null if not a valid 24-hour time. */
export function parseTime(raw: string): string | null {
  const t = raw.trim();
  let h: number;
  let m: number;
  const colon = /^(\d{1,2})[:.](\d{1,2})$/.exec(t);
  if (colon) {
    h = Number(colon[1]);
    m = Number(colon[2]);
  } else if (/^\d{1,4}$/.test(t)) {
    const d = t.length <= 2 ? t.padEnd(t.length, "0") : t;
    if (d.length <= 2) {
      h = Number(d);
      m = 0;
    } else {
      h = Number(d.slice(0, d.length - 2));
      m = Number(d.slice(-2));
    }
  } else return null;
  if (!(h >= 0 && h <= 23 && m >= 0 && m <= 59)) return null;
  return `${pad(h)}:${pad(m)}`;
}

/** Shows typed digits as HH:MM while typing (e.g. 0930 → 09:30). */
function mask(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 4);
  if (raw.includes(":") && /^\d{1,2}:\d{0,2}$/.test(raw)) return raw;
  return d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d;
}

/**
 * 24-hour time input: type freely (0930 → 09:30), ↑/↓ change by 5 minutes,
 * and a popover with shortcuts and an iOS-style scroll wheel (hours / 5-minute steps).
 */
export function TimeField({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const t = useTranslations("search");
  const id = useId();
  const [text, setText] = useState(value);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => setText(value), [value]);

  const commit = (raw: string) => {
    const v = parseTime(raw);
    if (v) {
      setError(false);
      setText(v);
      onChange(v);
    } else {
      setError(true);
      setText(value);
    }
  };
  const choose = (v: string) => {
    setError(false);
    setText(v);
    onChange(v);
    setOpen(false);
    input.current?.focus();
  };
  const base = parseTime(value) ?? nowBkk();
  /** apply a value but keep the popover open so the wheel can glide to it */
  const apply = (v: string) => {
    setError(false);
    setText(v);
    onChange(v);
  };

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <div className={cn("relative flex h-14 items-center rounded-xl border bg-card transition-colors focus-within:border-primary focus-within:ring-4 focus-within:ring-ring", error ? "border-bad" : "border-border hover:border-primary/40")}>
            <input
              ref={input}
              id={id}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="HH:MM"
              maxLength={5}
              value={text}
              aria-describedby={`${id}-hint`}
              aria-invalid={error}
              onClick={() => setOpen(true)}
              onChange={(e) => {
                setText(mask(e.target.value));
                setError(false);
              }}
              onBlur={(e) => {
                if (!e.relatedTarget?.closest("[data-time-popover]")) commit(text);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                  e.preventDefault();
                  const cur = parseTime(text) ?? base;
                  const step = e.key === "ArrowUp" ? 5 : -5;
                  const next = fromMin(Math.round((toMin(cur) + step) / 5) * 5);
                  setText(next);
                  setError(false);
                  onChange(next);
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  commit(text);
                  setOpen(false);
                } else if (e.key === "Escape") setOpen(false);
              }}
              className="h-full w-full min-w-0 rounded-xl bg-transparent pl-4 pr-12 text-2xl font-bold tracking-wide text-fg tabular placeholder:text-base placeholder:font-normal placeholder:text-muted focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-label={t("chooseTime")}
              aria-expanded={open}
              className="press absolute right-1.5 flex size-11 items-center justify-center rounded-lg text-primary hover:bg-primary-soft"
            >
              <Clock className="size-5" aria-hidden />
            </button>
          </div>
        </PopoverAnchor>
        <PopoverContent data-time-popover className="w-[min(92vw,320px)] p-3" onOpenAutoFocus={(e) => e.preventDefault()} onCloseAutoFocus={(e) => e.preventDefault()}>
          <div className="grid grid-cols-3 gap-2">
            {[
              { k: "now", v: nowBkk() },
              { k: "plus30", v: fromMin(toMin(nowBkk()) + 30) },
              { k: "plus60", v: fromMin(toMin(nowBkk()) + 60) },
            ].map((s) => (
              <button key={s.k} type="button" onClick={() => apply(s.v)} className="press flex min-h-11 flex-col items-center justify-center rounded-xl bg-primary-soft px-2 py-1 text-primary hover:bg-primary/20">
                <span className="text-sm font-semibold">{t(`timePicker.${s.k}`)}</span>
                <span className="text-[11px] tabular opacity-80">{s.v}</span>
              </button>
            ))}
          </div>
          <div className="mt-3">
            <TimeWheelPicker value={parseTime(value) ?? base} onChange={apply} hoursLabel={t("timePicker.hours")} minutesLabel={t("timePicker.minutes")} />
          </div>
          <button type="button" onClick={() => choose(parseTime(value) ?? base)} className="press mt-3 min-h-11 w-full rounded-xl bg-primary text-sm font-semibold text-on-primary shadow-soft hover:bg-primary-strong">
            {t("timePicker.done")}
          </button>
        </PopoverContent>
      </Popover>
      <p id={`${id}-hint`} role={error ? "alert" : undefined} className={cn("mt-1 text-xs", error ? "font-medium text-bad" : "sr-only")}>
        {error ? t("timePicker.invalid") : t("timePicker.hint")}
      </p>
    </div>
  );
}
