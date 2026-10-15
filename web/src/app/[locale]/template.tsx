"use client";

import * as m from "motion/react-m";
import type { ReactNode } from "react";
import { EASE } from "@/components/ui/motion";

/** Page transition: fade in and rise 8px. */
export default function Template({ children }: { children: ReactNode }) {
  return (
    <m.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: EASE }}>
      {children}
    </m.div>
  );
}
