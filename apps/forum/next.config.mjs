import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))

/**
 * F04: `standalone` output so the Dockerfile can ship a self-contained server.
 * F01: no `ignoreBuildErrors` — the strict typecheck is a real gate.
 */
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",

  /*
   * Kept out of the compiled chunks and required from node_modules at runtime.
   *
   * A lazy `require()` defers *execution*, not *inclusion*: the specifier is a
   * literal, so the bundler statically resolves it and inlines the module
   * anyway. Measured — before this, a board built with FILESTORE_DRIVER=local
   * had the AWS S3 client inlined into 18 server chunks, and postgres.js into 8
   * even in fixture mode.
   *
   * These are all server-only and none is needed by every deployment, which is
   * exactly what this option is for. It is also the condition ADR 0002 accepted
   * the S3 dependency on, so it is load-bearing rather than an optimisation.
   */
  serverExternalPackages: [
    "@aws-sdk/client-s3",
    "@aws-sdk/s3-request-presigner",
    "postgres",
  ],
  outputFileTracingRoot: path.join(here, "../../"),
  images: {
    unoptimized: true,
  },
  // Workspace packages ship TypeScript source, not built output.
  transpilePackages: [
    "@forum/accounts",
    "@forum/authorization",
    "@forum/core",
    "@forum/db",
    "@forum/drivers",
    "@forum/events",
    "@forum/forums",
    "@forum/groups",
    "@forum/posts",
    "@forum/settings",
    "@forum/shared",
    "@forum/tasks",
    "@forum/theme-default",
    "@forum/theme-kit",
    "@forum/threads",
    "@forum/ui",
  ],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy-Report-Only",
            value: [
              "default-src 'self'",
              "img-src 'self' data: https:",
              "style-src 'self' 'unsafe-inline'",
              "script-src 'self' 'unsafe-inline'",
              "connect-src 'self'",
              "frame-ancestors 'self'",
            ].join("; "),
          },
        ],
      },
    ]
  },
}

export default nextConfig
