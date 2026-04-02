import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
  // Turbopack (default in Next.js 16)
  // Alias server-only packages to an empty shim so the browser build doesn't break.
  turbopack: {
    resolveAlias: {
      "sharp":            "./lib/empty-shim.js",
      "onnxruntime-node": "./lib/empty-shim.js",
    },
  },
  // Webpack fallback (used when running with --webpack flag)
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "sharp$":            false,
      "onnxruntime-node$": false,
    };
    return config;
  },
};

export default nextConfig;
