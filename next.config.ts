import path from "node:path";
import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // Lets a local production build run alongside `next dev` without sharing .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // A lockfile in a parent folder otherwise makes Next infer the wrong workspace root.
  outputFileTracingRoot: path.join(__dirname),
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  // Browsers request /favicon.ico regardless of the <link rel="icon">; serve the app icon.
  async rewrites() {
    return [{ source: "/favicon.ico", destination: "/icon.svg" }];
  },
};

export default nextConfig;
