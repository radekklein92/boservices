import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // framer-motion není v defaultním optimizePackageImports listu Next.js
  // (lucide-react ano). Při ~60 klientských komponentách to zmenší JS bundle.
  experimental: {
    optimizePackageImports: ["framer-motion"],
  },
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default withNextIntl(nextConfig);
