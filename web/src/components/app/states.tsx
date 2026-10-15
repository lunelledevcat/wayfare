"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import { TriangleAlert, Wallet, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Button } from "../ui/button";
import { Card, Skeleton } from "../ui/primitives";

/** Shown when a tab needs the wallet and none is connected. */
export function ConnectPrompt({ text }: { text: string }) {
  const t = useTranslations("common.wallet");
  const { openConnectModal } = useConnectModal();
  return (
    <Card className="flex flex-col items-center gap-3 p-8 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
        <Wallet className="size-7" aria-hidden />
      </span>
      <p className="max-w-sm text-muted">{text}</p>
      <Button onClick={openConnectModal}>
        <Wallet aria-hidden /> {t("connect")}
      </Button>
    </Card>
  );
}

export function EmptyState({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body?: string; action?: ReactNode }) {
  return (
    <Card className="flex flex-col items-center gap-2 p-8 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-bg text-muted">
        <Icon className="size-7" aria-hidden />
      </span>
      <p className="font-semibold">{title}</p>
      {body && <p className="max-w-sm text-sm text-muted">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </Card>
  );
}

export function ListSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <Card key={i} className="space-y-3 p-5">
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-10 w-full" />
        </Card>
      ))}
    </div>
  );
}

export function LoadError({ text, onRetry, retryLabel }: { text: string; onRetry: () => void; retryLabel: string }) {
  return (
    <Card role="alert" className="flex flex-col items-center gap-3 p-6 text-center text-bad">
      <TriangleAlert className="size-6" aria-hidden />
      <p className="text-sm">{text}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        {retryLabel}
      </Button>
    </Card>
  );
}
