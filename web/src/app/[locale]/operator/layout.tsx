import type { ReactNode } from "react";
import { ClientMessages } from "@/components/client-messages";
import { WalletProviders } from "@/components/wallet/providers";

export default async function OperatorLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return (
    <ClientMessages locale={locale} ns={["operator", "wallet", "msg"]}>
      <WalletProviders>{children}</WalletProviders>
    </ClientMessages>
  );
}
