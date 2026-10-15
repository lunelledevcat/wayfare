"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { TriangleAlert, Wallet } from "lucide-react";
import { useTranslations } from "next-intl";

/** Wallet button without crypto jargon: "Connect wallet" / "Switch to Avalanche" / short address. */
export function WalletButton() {
  const t = useTranslations("common.wallet");
  return (
    <ConnectButton.Custom>
      {({ account, chain, openConnectModal, openChainModal, openAccountModal, mounted }) => {
        const ready = mounted;
        if (!ready) return <span className="inline-block h-10 w-32" aria-hidden />;
        if (!account)
          return (
            <button type="button" onClick={openConnectModal} className="press inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-on-primary shadow-soft hover:bg-primary-strong">
              <Wallet className="size-4" aria-hidden /> {t("connect")}
            </button>
          );
        if (chain?.unsupported)
          return (
            <button type="button" onClick={openChainModal} className="inline-flex h-10 items-center gap-2 rounded-xl bg-warn-fill px-4 text-sm font-semibold text-black">
              <TriangleAlert className="size-4" aria-hidden /> {t("wrongNetwork")}
            </button>
          );
        return (
          <button type="button" onClick={openAccountModal} className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-semibold hover:bg-bg" aria-label={t("account")}>
            <Wallet className="size-4 text-primary" aria-hidden /> <span className="tabular">{account.displayName}</span>
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}
