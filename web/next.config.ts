import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Static CSP (Next.js "without nonces" policy). Nonces would force every page to render
// dynamically and are incompatible with Cache Components' static shells, so inline scripts are
// allowed (Next.js streams page data in inline scripts). Script files carry SRI hashes
// (experimental.sri), and everything else is restricted to our own origin, as in the PHP app.
// The only raw HTML the app renders is escaped JSON-LD (components/public/breadcrumb.tsx).
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
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
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
    // Integrity hashes on every script file Next.js emits.
    sri: { algorithm: "sha256" },
    // forbidden() renders app/forbidden.tsx for staff-only pages.
    authInterrupts: true,
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
