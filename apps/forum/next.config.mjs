import { existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))

/** The workspace root — also `outputFileTracingRoot` below. */
const workspaceRoot = path.join(here, "../../")

/**
 * F02 — the workspace's `.env` files, loaded from the root rather than from
 * `apps/forum`.
 *
 * Next loads `.env` files itself, from the directory it was started in — which
 * for `pnpm dev` is `apps/forum`, so the configuration had to live there while
 * the operator CLI and the worker read nothing at all. One root file for all
 * three is the whole point; see `packages/core/src/env-files.ts`, which is the
 * same two files in the same order for every program that is not Next.
 *
 * Done here, in the config, because it is the earliest thing Next evaluates in
 * every process that serves a request — earlier than `instrumentation.ts`, and
 * unlike it, plain Node with no Edge compilation to worry about. It is also
 * skipped entirely by the standalone production server, which never reads this
 * file: correct, since the image is configured by the container and
 * `.dockerignore` keeps `.env` out of it.
 *
 * Duplicated rather than imported: this file is `.mjs`, and `@forum/core` ships
 * TypeScript source that nothing has transpiled at the moment Next reads its
 * config. Four lines, and the list is stated in both places on purpose.
 */
const loadedEnvFiles = []
for (const name of [".env.local", ".env"]) {
  const file = path.join(workspaceRoot, name)
  // First file to define a variable wins, and a real environment variable beats
  // both — `process.loadEnvFile` never overwrites a name that is already set.
  if (!existsSync(file)) continue
  process.loadEnvFile(file)
  loadedEnvFiles.push(name)
}

/*
 * Next prints its own `- Environments: .env` line for files it found in this
 * directory, and it now finds none — so without this, moving the file to the
 * root would have removed the one line telling a developer which environment
 * their board is running with. That line is exactly what is missed when the app
 * turns out to be talking to a database nobody expected.
 *
 * Dev only, and only when a file was read: `next build` and the standalone
 * server take their configuration from the platform, where the message would be
 * noise. It prints once per process that loads this config, which in `next dev`
 * is the server itself.
 */
if (process.env.NODE_ENV !== "production" && loadedEnvFiles.length > 0) {
  console.log(`- Environments: ${loadedEnvFiles.join(", ")} (${workspaceRoot})`)
}

/**
 * F04: `standalone` output so the Dockerfile can ship a self-contained server.
 * F01: no `ignoreBuildErrors` — the strict typecheck is a real gate.
 */
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Lets the isolated Playwright dev server run beside a developer's `.next`.
  distDir: process.env.FORUM_DIST_DIR ?? ".next",

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
    /*
     * F42's image codecs (ADR 0003). External for a reason beyond bundle size:
     * the tracer copies an external package's directory whole, `.wasm`
     * included, and `packages/drivers/src/images/locate-wasm.ts` needs those
     * files to be *on disk* — it reads and compiles them itself, because
     * letting the codec load its own module means `fetch()` of a `file:` URL,
     * which Node refuses. Bundling them would leave the `.wasm` untraced and
     * the standalone image unable to decode anything.
     */
    "@jsquash/jpeg",
    "@jsquash/png",
    "@jsquash/resize",
  ],
  outputFileTracingRoot: workspaceRoot,
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
