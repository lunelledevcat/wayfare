"use client";

import { domAnimation, LazyMotion, MotionConfig } from "motion/react";
import type { ReactNode } from "react";

/** Soft ease used everywhere (150–350 ms). */
export const EASE = [0.22, 1, 0.36, 1] as const;
export const SPRING = { type: "spring", stiffness: 520, damping: 38, mass: 0.8 } as const;

/**
 * Loads only the DOM animation feature set (small bundle) and makes every animation
 * respect the user's "reduce motion" setting automatically.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user" transition={{ duration: 0.25, ease: EASE }}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}
