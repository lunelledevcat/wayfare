"use client";

import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { MENU, planHref as href, POPULAR } from "@/lib/menu";
import { ModeIcon } from "./mode-icon";

export { MENU, planHref, POPULAR } from "@/lib/menu";

export function MegaMenu() {
  const t = useTranslations("common");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-medium text-fg hover:bg-bg"
      >
        {t("travelTypes")}
        <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && (
        <div className="absolute left-0 top-12 z-50 grid w-[680px] origin-top-left animate-pop-in grid-cols-3 gap-6 rounded-[20px] border border-border bg-elevated p-6 shadow-lift">
          {MENU.map((g) => (
            <div key={g.group}>
              <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">{t(`menu.${g.group}`)}</p>
              <ul className="space-y-1">
                {g.items.map((it) => (
                  <li key={it.key}>
                    <Link href={href(it.from, it.to, it.modes)} onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-xl p-2 hover:bg-bg">
                      <ModeIcon mode={it.mode} className="size-8" />
                      <span className="text-sm font-semibold">{t(`menu.${it.key}`)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">{t("menu.popular")}</p>
            <ul className="space-y-1">
              {POPULAR.map((p) => (
                <li key={p.key}>
                  <Link href={href(p.from, p.to)} onClick={() => setOpen(false)} className="block rounded-xl p-2 text-sm font-medium hover:bg-bg">
                    {t(`popular.${p.key}`)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
