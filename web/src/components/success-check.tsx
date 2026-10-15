"use client";

import * as m from "motion/react-m";
import { EASE } from "./ui/motion";

/** Animated success mark: the circle draws, then the tick. */
export function SuccessCheck({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 52 52" className={className} aria-hidden focusable="false">
      <m.circle cx="26" cy="26" r="23" fill="var(--wf-good-soft)" stroke="var(--wf-good)" strokeWidth="3" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.35, ease: EASE }} />
      <m.path
        d="M15.5 27.5 22.5 34.5 37 19"
        fill="none"
        stroke="var(--wf-good)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.3, ease: EASE, delay: 0.3 }}
      />
    </svg>
  );
}
