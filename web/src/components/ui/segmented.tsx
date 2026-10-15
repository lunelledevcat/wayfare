"use client";

import * as m from "motion/react-m";
import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SPRING } from "./motion";

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
}

/**
 * Segmented control (radio group) with a highlight that slides to the selected option.
 * Arrow keys move the selection; only the selected option is in the tab order.
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  size = "md",
  className,
  columns,
}: {
  value: T;
  onChange: (v: T) => void;
  options: SegmentOption<T>[];
  ariaLabel: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  /** grid columns on small screens (wraps big controls into 2×2) */
  columns?: string;
}) {
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = (i + dir + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn("grid gap-1 rounded-2xl border border-border bg-subtle p-1", columns ?? "auto-cols-fr grid-flow-col", className)}
    >
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              "press relative flex flex-col items-center justify-center rounded-xl px-3 text-center outline-none focus-visible:ring-4 focus-visible:ring-ring",
              size === "sm" ? "min-h-11 text-sm" : size === "md" ? "min-h-12 text-sm" : "min-h-16 py-2",
              on ? "text-on-primary" : "text-fg hover:bg-card/70",
            )}
          >
            {on && <m.span layoutId={`seg-${id}`} className="absolute inset-0 rounded-xl bg-primary shadow-soft" transition={SPRING} aria-hidden />}
            <span className={cn("relative z-10 inline-flex items-center gap-1.5 font-semibold", size === "lg" && "text-base md:text-lg")}>
              {o.icon}
              {o.label}
            </span>
            {o.hint && <span className={cn("relative z-10 mt-0.5 text-xs", on ? "opacity-85" : "text-muted")}>{o.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}
