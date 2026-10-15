import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Logo } from "./logo";

export function Footer() {
  const t = useTranslations("common");
  return (
    <footer className="mt-16 border-t border-border bg-card">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 md:grid-cols-4">
        <div className="space-y-3">
          <Logo />
          <p className="text-sm text-muted">{t("footer.tagline")}</p>
        </div>
        <div>
          <p className="mb-2 text-sm font-bold">{t("footer.product")}</p>
          <ul className="space-y-1 text-sm text-muted">
            <li><Link href="/" className="hover:text-fg">{t("footer.plan")}</Link></li>
            <li><Link href="/app" className="hover:text-fg">{t("footer.app")}</Link></li>
            <li><Link href="/operator" className="hover:text-fg">{t("operators")}</Link></li>
          </ul>
        </div>
        <div>
          <p className="mb-2 text-sm font-bold">{t("footer.data")}</p>
          <ul className="space-y-1 text-sm text-muted">
            <li><Link href="/about-data" className="hover:text-fg">{t("aboutData")}</Link></li>
            <li>สนข. GTFS · Open-Meteo · OpenStreetMap</li>
          </ul>
        </div>
        <div className="text-sm text-muted">
          <p>{t("footer.demo")}</p>
          <p className="mt-2">© 2026 Wayfare · U-Hackathon</p>
        </div>
      </div>
    </footer>
  );
}
