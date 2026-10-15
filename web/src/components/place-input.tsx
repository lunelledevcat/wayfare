"use client";

import { Building2, LoaderCircle, MapPin, Plane, TrainFront, BusFront } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { pick } from "@/lib/format";
import type { PlaceSuggestion } from "@/lib/providers/places";
import { cn } from "@/lib/utils";

export interface PlaceValue {
  token: string;
  label: string;
}

const KIND_ICON = { airport: Plane, station: TrainFront, terminal: BusFront, stop: BusFront, city: Building2, district: MapPin, landmark: MapPin, address: MapPin } as const;

export function PlaceInput({ label, value, onChange, placeholder, autoFocus }: { label: string; value: PlaceValue | null; onChange: (v: PlaceValue | null) => void; placeholder: string; autoFocus?: boolean }) {
  const locale = useLocale();
  const t = useTranslations("search");
  const id = useId();
  const [text, setText] = useState(value?.label ?? "");
  const [items, setItems] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const reqRef = useRef(0);

  useEffect(() => setText(value?.label ?? ""), [value?.label]);

  useEffect(() => {
    if (!open) return;
    const q = text.trim();
    if (q.length < 1 || q === value?.label) return;
    const my = ++reqRef.current;
    const fetchIt = async (osm: boolean) => {
      setLoading(true);
      try {
        const res = await fetch(`/api/places?q=${encodeURIComponent(q)}&lang=${locale}${osm ? "&osm=1" : ""}`);
        const data = (await res.json()) as { results: PlaceSuggestion[] };
        if (my === reqRef.current) {
          setItems(data.results);
          setActive(0);
        }
      } catch {
        /* keep previous suggestions */
      } finally {
        if (my === reqRef.current) setLoading(false);
      }
    };
    // local suggestions quickly; OpenStreetMap (Nominatim) only after 1 s of no typing
    const local = setTimeout(() => fetchIt(false), 200);
    const osm = q.length >= 3 ? setTimeout(() => fetchIt(true), 1100) : undefined;
    return () => {
      clearTimeout(local);
      if (osm) clearTimeout(osm);
    };
  }, [text, open, locale, value?.label]);

  const choose = (s: PlaceSuggestion) => {
    const l = pick(s.name, locale);
    onChange({ token: s.token, label: l });
    setText(l);
    setOpen(false);
  };

  const listId = `${id}-list`;
  return (
    <div className="relative">
      <label htmlFor={id} className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </label>
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-primary" aria-hidden />
        <input
          id={id}
          role="combobox"
          aria-expanded={open && items.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && items[active] ? `${id}-${active}` : undefined}
          autoComplete="off"
          autoFocus={autoFocus}
          value={text}
          placeholder={placeholder}
          onFocus={(e) => {
            setOpen(true);
            e.currentTarget.select();
          }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
            if (value) onChange(null);
          }}
          onKeyDown={(e) => {
            if (!open || items.length === 0) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(items.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              choose(items[active]);
            } else if (e.key === "Escape") setOpen(false);
          }}
          className="h-14 w-full rounded-xl border border-border bg-card pl-10 pr-9 text-base font-medium text-fg placeholder:font-normal placeholder:text-muted focus:border-primary focus:outline-none focus:ring-4 focus:ring-ring"
        />
        {loading && <LoaderCircle className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted" aria-hidden />}
      </div>
      {open && items.length > 0 && (
        <ul id={listId} role="listbox" className="thin-scroll absolute z-50 mt-1.5 max-h-80 w-full animate-pop-in overflow-auto rounded-2xl border border-border bg-elevated p-1 shadow-lift">
          {items.map((s, i) => {
            const Icon = KIND_ICON[s.kind] ?? MapPin;
            return (
              <li
                key={s.token}
                id={`${id}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(s);
                }}
                onMouseEnter={() => setActive(i)}
                className={cn("flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5", i === active && "bg-primary-soft")}
              >
                <Icon className="size-5 shrink-0 text-muted" aria-hidden />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{pick(s.name, locale)}</span>
                  <span className="block truncate text-xs text-muted">
                    {s.detail ? pick(s.detail, locale) : null}
                    {s.source === "nominatim" ? ` · ${t("osm")}` : s.source === "gtfs" ? ` · ${t("gtfs")}` : ""}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
