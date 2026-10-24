import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Static CSP (Next.js "without nonces" policy). Nonces would force every page to render
// dynamically and are incompatible with Cache Components' static shells, so inline scripts are
// allowed; everything else is restricted to our own origin, as in the PHP app.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self'",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=31536000" }]),
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  typedRoutes: true,
  output: "standalone",
  poweredByHeader: false,
  // Import templates are read from disk at runtime; make sure the standalone build ships them.
  outputFileTracingIncludes: { "/du-lieu/[file]": ["./templates/**"] },
  experimental: {
    serverActions: {
      // Content imports are capped at 1 MB of payload; leave headroom for form encoding.
      bodySizeLimit: "2mb",
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
