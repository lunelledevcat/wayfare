"use client";

import { LoaderCircle, Square, Volume2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

let status: Promise<boolean> | null = null;
/** Ask the server once per page load whether voice (ElevenLabs) is configured. */
function voiceEnabled(): Promise<boolean> {
  status ??= fetch("/api/voice")
    .then((r) => r.json())
    .then((d: { enabled?: boolean }) => !!d.enabled)
    .catch(() => false);
  return status;
}

const audioUrls = new Map<string, string>();

/**
 * Reads `text` aloud in the current language via /api/voice (ElevenLabs on the server).
 * Renders nothing when voice is not configured; hides itself if a request fails.
 */
export function VoiceButton({ text, label, className }: { text: string; label?: string; className?: string }) {
  const t = useTranslations("common.voice");
  const locale = useLocale();
  const [enabled, setEnabled] = useState(false);
  const [state, setState] = useState<"idle" | "loading" | "playing" | "failed">("idle");
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let alive = true;
    voiceEnabled().then((on) => alive && setEnabled(on));
    return () => {
      alive = false;
      audio.current?.pause();
    };
  }, []);

  if (!enabled) return null;
  if (state === "failed") return <p className="text-xs text-muted">{t("unavailable")}</p>;

  const toggle = async () => {
    if (state === "playing") {
      audio.current?.pause();
      setState("idle");
      return;
    }
    const key = `${locale}|${text}`;
    try {
      let url = audioUrls.get(key);
      if (!url) {
        setState("loading");
        const res = await fetch("/api/voice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, locale }) });
        if (!res.ok) throw new Error(String(res.status));
        url = URL.createObjectURL(await res.blob());
        audioUrls.set(key, url);
      }
      audio.current?.pause();
      const a = new Audio(url);
      audio.current = a;
      a.onended = () => setState("idle");
      await a.play();
      setState("playing");
    } catch {
      setState("failed");
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={state === "loading"}
      aria-pressed={state === "playing"}
      className={cn("inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-semibold text-primary hover:bg-primary-soft disabled:opacity-60", className)}
    >
      {state === "loading" ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : state === "playing" ? <Square className="size-4" aria-hidden /> : <Volume2 className="size-4" aria-hidden />}
      {state === "loading" ? t("loading") : state === "playing" ? t("stop") : (label ?? t("listen"))}
    </button>
  );
}
