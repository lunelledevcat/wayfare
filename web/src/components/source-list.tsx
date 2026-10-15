import { Database } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { Source } from "@/lib/planner/types";
import { dayLabel } from "@/lib/format";
import { Badge } from "./ui/primitives";

/** "Data from …" list shown under results and on the trip page. */
export function SourceList({ sources, title }: { sources: Source[]; title: string }) {
  const t = useTranslations("common");
  const locale = useLocale();
  return (
    <section className="mt-8 rounded-2xl border border-border bg-card p-4" aria-labelledby="sources">
      <h2 id="sources" className="flex items-center gap-2 font-bold">
        <Database className="size-4 text-primary" aria-hidden /> {title}
      </h2>
      <ul className="mt-3 grid gap-2 text-sm md:grid-cols-2">
        {sources.map((s) => {
          const d = Date.parse(s.updatedAt);
          return (
            <li key={s.id} className="flex flex-wrap items-center gap-2">
              <a href={s.url} className="font-medium text-primary underline-offset-2 hover:underline" target={s.url.startsWith("http") ? "_blank" : undefined} rel="noreferrer">
                {s.name}
              </a>
              {s.fallback && <Badge tone="warn">{t("fallbackData")}</Badge>}
              {s.estimate && !s.fallback && <Badge tone="neutral">{t("estimate")}</Badge>}
              {Number.isFinite(d) && d > 0 && <span className="text-xs text-muted">{t("updated", { date: dayLabel(d, locale, { day: "numeric", month: "short", year: "numeric" }) })}</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
