import path from "node:path";
import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  cacheComponents: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders({
          supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
          apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL,
          dev: process.env.NODE_ENV === "development",
        }),
      },
    ];
  },
  // We make our own thumbnails at upload, so skip on-the-fly optimization
  // (Vercel's free tier allows only 5,000 transformations a month).
  images: { unoptimized: true },
  partialPrefetching: true,
  turbopack: {
    // The repo root also has a package-lock.json (Supabase CLI), so pin the app root here.
    root: path.resolve(import.meta.dirname),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
