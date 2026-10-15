"use client";

import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { planHref, POPULAR } from "@/lib/menu";
import { usePrefs } from "../prefs";
import { SearchBox } from "../search-box";

export function PlanTab() {
  const t = useTranslations("app.plan");
  const tc = useTranslations("common");
  const { prefs } = usePrefs();
  return (
    <div className="space-y-5">
      <p className="text-muted">{t("intro")}</p>
      <SearchBox compact priority={prefs.priority} />
      <section aria-labelledby="popular">
        <h2 id="popular" className="mb-2 font-bold">
          {t("popular")}
        </h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {POPULAR.map((p) => (
            <li key={p.key}>
              <Link
                href={`${planHref(p.from, p.to)}&priority=${prefs.priority}`}
                className="flex min-h-12 items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 font-medium shadow-soft hover:border-primary hover:text-primary"
              >
                {tc(`popular.${p.key}`)}
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
