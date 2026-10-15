"use client";

import { Map as MapIcon, Route, Ticket, UserRound, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { PlanTab } from "./plan-tab";
import { ProfileTab } from "./profile-tab";
import { TicketsTab } from "./tickets-tab";
import { TripsTab } from "./trips-tab";

const TABS: { id: "plan" | "trips" | "tickets" | "profile"; icon: LucideIcon }[] = [
  { id: "plan", icon: MapIcon },
  { id: "trips", icon: Route },
  { id: "tickets", icon: Ticket },
  { id: "profile", icon: UserRound },
];
type TabId = (typeof TABS)[number]["id"];

/** Mobile-first app with a fixed bottom tab bar; the selected tab lives in ?tab=. */
export function AppShell() {
  const t = useTranslations("app");
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = search.get("tab");
  const tab: TabId = TABS.some((x) => x.id === raw) ? (raw as TabId) : "plan";

  const select = (id: TabId) => {
    const qs = new URLSearchParams(search.toString());
    qs.set("tab", id);
    router.replace(`${pathname}?${qs}`, { scroll: false });
  };

  return (
    <>
      <main className="mx-auto max-w-3xl px-4 pb-28 pt-5">
        <h1 className="mb-4 text-2xl font-extrabold">{t(`tabs.${tab}`)}</h1>
        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
          {tab === "plan" && <PlanTab />}
          {tab === "trips" && <TripsTab />}
          {tab === "tickets" && <TicketsTab />}
          {tab === "profile" && <ProfileTab />}
        </div>
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur" aria-label={t("tabsLabel")}>
        <div role="tablist" className="mx-auto grid max-w-3xl grid-cols-4">
          {TABS.map(({ id, icon: Icon }) => {
            const active = id === tab;
            return (
              <button
                key={id}
                id={`tab-${id}`}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`panel-${id}`}
                onClick={() => select(id)}
                className={cn("flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-semibold transition-colors", active ? "text-primary" : "text-muted hover:text-fg")}
              >
                <span className={cn("flex h-8 w-14 items-center justify-center rounded-full", active && "bg-primary-soft")}>
                  <Icon className="size-5" aria-hidden />
                </span>
                {t(`tabs.${id}`)}
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
