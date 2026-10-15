"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { connectorsForWallets, lightTheme, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { coinbaseWallet, injectedWallet, metaMaskWallet, rabbyWallet, walletConnectWallet } from "@rainbow-me/rainbowkit/wallets";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { useState, type ReactNode } from "react";
import { createConfig, http, WagmiProvider } from "wagmi";
import { activeChain } from "@/lib/chain";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

const connectors = connectorsForWallets(
  [{ groupName: "Wallets", wallets: projectId ? [metaMaskWallet, rabbyWallet, coinbaseWallet, walletConnectWallet] : [injectedWallet, metaMaskWallet, coinbaseWallet] }],
  { appName: "Wayfare", projectId: projectId || "wayfare-local-demo" },
);

export const wagmiConfig = createConfig({
  chains: [activeChain],
  connectors,
  transports: { [activeChain.id]: http() },
  ssr: true,
});

const RK_LOCALE: Record<string, "th-TH" | "en-US" | "zh-CN" | "ja-JP"> = { th: "th-TH", en: "en-US", zh: "zh-CN", ja: "ja-JP" };

/** Wallet providers — mounted only in trip / app / operator layouts so other pages stay light. */
export function WalletProviders({ children }: { children: ReactNode }) {
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 10_000, refetchOnWindowFocus: false } } }));
  const locale = useLocale();
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={qc}>
        <RainbowKitProvider locale={RK_LOCALE[locale] ?? "en-US"} theme={lightTheme({ accentColor: "#1463ff", borderRadius: "large" })} modalSize="compact" initialChain={activeChain}>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
