import type { ReactNode } from "react";
import { ClientMessages } from "@/components/client-messages";
import { WalletProviders } from "@/components/wallet/providers";

export default async function TripLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return (
    <ClientMessages locale={locale} ns={["plan", "trip", "msg", "wallet"]}>
      <WalletProviders>{children}</WalletProviders>
    </ClientMessages>
  );
}
