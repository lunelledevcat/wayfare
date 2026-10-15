"use client";

import { Check } from "lucide-react";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import type { ReactNode } from "react";
import type { Mode } from "@/lib/planner/types";
import { cn } from "@/lib/utils";
import { MODE_COLOR, ModeIcon } from "./mode-icon";
import { SPRING } from "./ui/motion";

/** Pop-in check mark used by selectable chips. */
function CheckPop({ on, className }: { on: boolean; className?: string }) {
  return (
    <AnimatePresence initial={false}>
      {on && (
        <m.span
          key="c"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          transition={SPRING}
          className={cn("absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-on-primary shadow-soft", className)}
          aria-hidden
        >
          <Check className="size-3.5" strokeWidth={3} />
        </m.span>
      )}
    </AnimatePresence>
  );
}

/** Vehicle filter chip: icon tile in the vehicle colour; selecting animates the background and pops a check mark. */
export function ModeChip({ mode, label, on, onToggle }: { mode: Mode; label: string; on: boolean; onToggle: () => void }) {
  return (
    <m.button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      whileTap={{ scale: 0.95 }}
      animate={{ backgroundColor: on ? `color-mix(in srgb, ${MODE_COLOR[mode]} 16%, var(--wf-card))` : "var(--wf-card)" }}
      transition={{ duration: 0.2 }}
      className={cn(
        "relative inline-flex min-h-11 items-center gap-2 rounded-xl border py-1 pl-1 pr-3 text-sm font-semibold outline-none focus-visible:ring-4 focus-visible:ring-ring",
        on ? "border-[color:var(--sel)] text-fg" : "border-border text-fg hover:border-primary/40",
      )}
      style={{ "--sel": MODE_COLOR[mode] } as React.CSSProperties}
    >
      <ModeIcon mode={mode} className="size-9" />
      {label}
      <CheckPop on={on} />
    </m.button>
  );
}

/** Generic selectable chip (multi-select or single choice), with optional icon and a small sub-label. */
export function ChoiceChip({ on, onClick, icon, label, sub, role = "checkbox", className }: { on: boolean; onClick: () => void; icon?: ReactNode; label: ReactNode; sub?: ReactNode; role?: "checkbox" | "radio"; className?: string }) {
  return (
    <m.button
      type="button"
      role={role}
      aria-checked={on}
      onClick={onClick}
      whileTap={{ scale: 0.95 }}
      className={cn(
        "relative flex min-h-11 items-center gap-2 rounded-xl border px-3 py-1.5 text-left text-sm outline-none transition-colors focus-visible:ring-4 focus-visible:ring-ring",
        on ? "border-primary bg-primary-soft text-primary" : "border-border bg-card text-fg hover:border-primary/40 hover:bg-subtle",
        className,
      )}
    >
      {icon}
      <span className="min-w-0">
        <span className="block font-semibold leading-tight">{label}</span>
        {sub && <span className={cn("block text-[11px] leading-tight tabular", on ? "text-primary/80" : "text-muted")}>{sub}</span>}
      </span>
      <CheckPop on={on} />
    </m.button>
  );
}

/** Accessible on/off switch row. */
export function SwitchRow({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="press flex min-h-12 w-full items-center gap-3 rounded-xl border border-border bg-card px-3 py-2 text-left hover:bg-subtle focus-visible:ring-4 focus-visible:ring-ring"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
      <span className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200", on ? "bg-primary" : "bg-muted/35")} aria-hidden>
        <m.span className="absolute top-1 size-5 rounded-full bg-white shadow-soft" animate={{ left: on ? 24 : 4 }} transition={SPRING} />
      </span>
    </button>
  );
}
