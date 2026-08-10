import { existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))

const workspaceRoot = path.join(here, "../../")

const loadedEnvFiles = []
for (const name of [".env.local", ".env"]) {
  const file = path.join(workspaceRoot, name)
  if (!existsSync(file)) continue
  process.loadEnvFile(file)
  loadedEnvFiles.push(name)
}

if (process.env.NODE_ENV !== "production" && loadedEnvFiles.length > 0) {
  console.log(`- Environments: ${loadedEnvFiles.join(", ")} (${workspaceRoot})`)
}

const nextConfig = {
  output: "standalone",
  poweredByHeader: false,
  distDir: process.env.FORUM_DIST_DIR ?? ".next",

  serverExternalPackages: [
    "@aws-sdk/client-s3",
    "@aws-sdk/s3-request-presigner",
    "postgres",
    "@jsquash/jpeg",
    "@jsquash/png",
    "@jsquash/resize",
    "nodemailer",
  ],
  outputFileTracingRoot: workspaceRoot,
  images: {
    unoptimized: true,
  },
  transpilePackages: [
    "@meith/accounts",
    "@meith/authorization",
    "@meith/core",
    "@meith/db",
    "@meith/drivers",
    "@meith/events",
    "@meith/forums",
    "@meith/groups",
    "@meith/polls",
    "@meith/drafts",
    "@meith/posts",
    "@meith/settings",
    "@meith/shared",
    "@meith/tasks",
    "@meith/theme-default",
    "@meith/theme-kit",
    "@meith/threads",
    "@meith/ui",
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
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "img-src 'self' data: https:",
              "style-src 'self' 'unsafe-inline'",
              // React's development build needs eval() for its debugging
              // features and logs to every page load without it. Never shipped:
              // `next build` sets NODE_ENV=production.
              `script-src 'self' 'unsafe-inline'${
                process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"
              }`,
              "connect-src 'self'",
              "frame-ancestors 'self'",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ]
  },
}

export default nextConfig
