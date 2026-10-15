import path from "node:path";
import bundleAnalyzer from "@next/bundle-analyzer";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { loadEnvConfig } from "@next/env";

// one .env at the repo root serves contracts and web
loadEnvConfig(path.resolve(__dirname, ".."));

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === "true" });

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // pre-built GTFS JSON is read with fs at runtime; make sure it ships with server functions
  outputFileTracingIncludes: {
    "/api/**/*": ["./data/**/*"],
    "/[locale]/**/*": ["./data/**/*"],
  },
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  turbopack: {
    resolveAlias: { "@base-org/account": "./src/lib/stubs/base-account.ts" },
  },
  webpack: (config) => {
    // optional peer deps pulled in by wallet SDKs
    config.externals.push("pino-pretty", "lokijs", "encoding");
    config.resolve.alias = { ...config.resolve.alias, "@base-org/account": path.resolve(__dirname, "src/lib/stubs/base-account.ts") };
    return config;
  },
};

export default withBundleAnalyzer(withNextIntl(nextConfig));
