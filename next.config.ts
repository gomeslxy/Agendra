import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  compress: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },
  // Heavy server-only packages — keep out of the client bundle
  serverExternalPackages: [
    "exceljs",
    "nodemailer",
    "@google/generative-ai",
    "@anthropic-ai/sdk",
  ],
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion", "@supabase/ssr", "@supabase/supabase-js"],
  },
};

export default config;
