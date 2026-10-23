import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  typedRoutes: true,
  output: "standalone",
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // Content imports are capped at 1 MB of payload; leave headroom for form encoding.
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
