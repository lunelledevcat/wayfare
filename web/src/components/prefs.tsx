"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { DEFAULT_TIME_VALUE, type DisplayCurrency } from "@/lib/config";
import type { Priority } from "@/lib/planner/types";

export interface UserPrefs {
  currency: DisplayCurrency;
  timeValue: number;
  priority: Priority;
}

const DEFAULTS: UserPrefs = { currency: "THB", timeValue: DEFAULT_TIME_VALUE, priority: "value" };
const KEY = "wayfare.prefs.v1";

const Ctx = createContext<{ prefs: UserPrefs; setPrefs: (p: Partial<UserPrefs>) => void }>({ prefs: DEFAULTS, setPrefs: () => {} });

/** Per-viewer display preferences kept in localStorage (safe to lose). */
export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, set] = useState<UserPrefs>(DEFAULTS);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) set({ ...DEFAULTS, ...JSON.parse(raw) });
    } catch {
      /* storage unavailable */
    }
  }, []);
  const setPrefs = useCallback((p: Partial<UserPrefs>) => {
    set((prev) => {
      const next = { ...prev, ...p };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  }, []);
  return <Ctx.Provider value={{ prefs, setPrefs }}>{children}</Ctx.Provider>;
}

export const usePrefs = () => useContext(Ctx);
