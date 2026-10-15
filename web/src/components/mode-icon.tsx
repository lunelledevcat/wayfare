import type { Mode } from "@/lib/planner/types";
import { cn } from "@/lib/utils";
import { BoatIcon, CarIcon, CoachIcon, FlightIcon, MetroIcon, MotorbikeIcon, TaxiIcon, TrainIcon, VanIcon, WalkIcon, type Icon } from "./icons";

const ICONS: Record<Mode, Icon> = {
  walk: WalkIcon,
  bts: MetroIcon,
  mrt: MetroIcon,
  arl: MetroIcon,
  red: MetroIcon,
  train: TrainIcon,
  bus: CoachIcon,
  coach: CoachIcon,
  van: VanIcon,
  boat: BoatIcon,
  flight: FlightIcon,
  taxi: TaxiIcon,
  grab: CarIcon,
  win: MotorbikeIcon,
  car: CarIcon,
};

/** Colour always paired with an icon (meaning never carried by colour alone). */
export const MODE_COLOR: Record<Mode, string> = {
  walk: "var(--wf-mode-walk)",
  bts: "var(--wf-mode-metro)",
  mrt: "var(--wf-mode-metro)",
  arl: "var(--wf-mode-metro)",
  red: "var(--wf-mode-train)",
  train: "var(--wf-mode-train)",
  bus: "var(--wf-mode-bus)",
  coach: "var(--wf-mode-coach)",
  van: "var(--wf-mode-van)",
  boat: "var(--wf-mode-boat)",
  flight: "var(--wf-mode-flight)",
  taxi: "var(--wf-mode-taxi)",
  grab: "var(--wf-mode-taxi)",
  win: "var(--wf-mode-win)",
  car: "var(--wf-mode-car)",
};

export function ModeIcon({ mode, className, label, color }: { mode: Mode; className?: string; label?: string; color?: string | null }) {
  const Icon = ICONS[mode];
  return (
    <span
      className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-white", className)}
      style={{ background: color ?? MODE_COLOR[mode] }}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <Icon className="size-[66%]" />
    </span>
  );
}
