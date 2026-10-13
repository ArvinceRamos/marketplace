import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
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
