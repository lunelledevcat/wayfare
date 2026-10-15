"use client";

import { LoaderCircle } from "lucide-react";
import { signIn, useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "./ui/button";

/** Official-style multicolour "G" (inline SVG). */
function GoogleG({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      <path fill="#4285F4" d="M22.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h5.9a5.04 5.04 0 0 1-2.19 3.31v2.75h3.54c2.07-1.91 3.25-4.72 3.25-8.09Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.54-2.75c-.98.66-2.24 1.05-3.74 1.05-2.87 0-5.3-1.94-6.17-4.55H2.17v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.83 14.09a6.6 6.6 0 0 1 0-4.18V7.07H2.17a11 11 0 0 0 0 9.86l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.07.56 4.21 1.65l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.17 7.07l3.66 2.84C6.7 7.32 9.13 5.38 12 5.38Z" />
    </svg>
  );
}

/** Only same-site relative paths are allowed as a post-login destination (prevents open redirects). */
const safeTarget = (raw: string | null) => (raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/app");

export function LoginCard({ configured }: { configured: boolean }) {
  const t = useTranslations("common.auth");
  const params = useSearchParams();
  const router = useRouter();
  const { status } = useSession();
  const [busy, setBusy] = useState(false);
  const target = safeTarget(params.get("callbackUrl"));
  const failed = params.get("error");

  useEffect(() => {
    if (status === "authenticated") router.replace(target);
  }, [status, router, target]);

  return (
    <div className="mx-auto w-full max-w-md rounded-[20px] border border-border bg-elevated p-6 text-center shadow-lift md:p-8">
      <h1 className="text-2xl font-extrabold">{t("title")}</h1>
      <p className="mt-2 text-muted">{t("subtitle")}</p>
      {failed && (
        <p role="alert" className="mt-4 rounded-xl bg-bad-soft px-3 py-2 text-sm font-medium text-bad">
          {t("error")}
        </p>
      )}
      {!configured && (
        <p role="status" className="mt-4 rounded-xl bg-warn-soft px-3 py-2 text-sm font-medium text-warn">
          {t("notConfigured")}
        </p>
      )}
      <Button
        size="lg"
        variant="outline"
        className="mt-6 w-full bg-white text-[#1f1f1f] hover:bg-white dark:border-white/20"
        disabled={busy || !configured}
        onClick={() => {
          setBusy(true);
          void signIn("google", { callbackUrl: target });
        }}
      >
        {busy ? <LoaderCircle className="animate-spin" aria-hidden /> : <GoogleG className="size-5" />}
        {t("google")}
      </Button>
      <p className="mt-4 text-xs text-muted">{t("privacy")}</p>
    </div>
  );
}
