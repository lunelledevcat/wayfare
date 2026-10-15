import { useTranslations } from "next-intl";
import { CHAIN_KEY, deployment, explorerAddress } from "@/lib/chain";
import { cn } from "@/lib/utils";

/** Avalanche mark: red disc with the two-triangle "A" (sponsor attribution). */
function AvalancheMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      <circle cx="12" cy="12" r="11" fill="#E84142" />
      <path d="M13.7 6.3a.9.9 0 0 0-1.6 0L6.4 16.4a.9.9 0 0 0 .8 1.4h3.6a1.8 1.8 0 0 0 1.6-.9l2.6-4.6a1.8 1.8 0 0 0 0-1.8Z" fill="#fff" />
      <path d="M17.2 14.2a.9.9 0 0 0-1.6 0l-1.9 3.3a.9.9 0 0 0 .8 1.3h3.8a.9.9 0 0 0 .8-1.3Z" fill="#fff" />
    </svg>
  );
}

/** "Built on Avalanche C-Chain" — links to the booking contract on Snowtrace when deployed on Fuji. */
export function AvalancheBadge({ className, tone = "card" }: { className?: string; tone?: "card" | "plain" }) {
  const t = useTranslations("common");
  const href = (deployment && explorerAddress(deployment.booking)) || "https://www.avax.network/";
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "inline-flex min-h-9 items-center gap-2 rounded-full text-xs font-semibold text-fg",
        tone === "card" ? "border border-border bg-card px-3 py-1.5 shadow-soft hover:bg-bg" : "hover:underline",
        className,
      )}
      title={CHAIN_KEY === "fuji" ? t("avalanche.contract") : undefined}
    >
      <AvalancheMark className="size-5" />
      {t("avalanche.built")}
    </a>
  );
}
