import { existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))

/** The workspace root — also `outputFileTracingRoot` below. */
const workspaceRoot = path.join(here, "../../")

/**
 * F02 — the workspace's `.env` files, loaded from the root rather than from
 * `apps/community`.
 *
 * Next loads `.env` files itself, from the directory it was started in — which
 * for `pnpm dev` is `apps/community`, so the configuration had to live there while
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
 * Duplicated rather than imported: this file is `.mjs`, and `@meith/core` ships
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
  /*
   * `X-Powered-By: Next.js` on every response, named in the audit of
   * 7 August 2026. Not a vulnerability — it is one line of reconnaissance
   * somebody could get from the markup anyway — and one line to stop sending.
   */
  poweredByHeader: false,
  // Lets the isolated Playwright dev server run beside a developer's `.next`.
  distDir: process.env.COMMUNITY_DIST_DIR ?? ".next",

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
   * exactly what this option is for. It is also the condition on which the S3
   * dependency was accepted, so it is load-bearing rather than an optimisation.
   */
  serverExternalPackages: [
    "@aws-sdk/client-s3",
    "@aws-sdk/s3-request-presigner",
    "postgres",
    /*
     * The image codecs. External for a reason beyond bundle size:
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
    /*
     * The SMTP transport. Node-only — it reaches for `net`, `tls` and `dns`, and
     * resolves parts of itself by dynamic require — so bundling it produces a
     * chunk that fails to build rather than one that is merely large. Only the
     * boards that send over SMTP load it at all.
     */
    "nodemailer",
  ],
  outputFileTracingRoot: workspaceRoot,
  images: {
    unoptimized: true,
  },
  // Workspace packages ship TypeScript source, not built output.
  transpilePackages: [
    "@meith/accounts",
    "@meith/authorization",
    "@meith/core",
    "@meith/db",
    "@meith/drivers",
    "@meith/events",
    "@meith/communities",
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
          /*
           * **Enforced**, not report-only.
           *
           * It was `Content-Security-Policy-Report-Only` with no `report-uri`
           * and no `report-to`, which the 7 August 2026 audit pointed out is a
           * header that does nothing at all: report-only blocks nothing by
           * definition, and with nowhere to send a report it does not report
           * either. A policy that neither enforces nor observes is worse than
           * none, because it reads on a headers scan as though the board had
           * one.
           *
           * `script-src` keeps `'unsafe-inline'` and that is not an oversight:
           * Next's App Router inlines the RSC payload and the bootstrap in
           * `<script>` tags on every page, so dropping it turns the board into
           * a blank screen. Removing it needs a per-request nonce threaded
           * through the proxy, which is a change of its own — and the reason
           * this is still worth enforcing meanwhile is everything else in the
           * list: `default-src 'self'` and `connect-src 'self'` stop an
           * injection reaching a third-party host, `object-src 'none'` and
           * `base-uri 'self'` close two injection routes that owe nothing to
           * inline script, and `form-action 'self'` stops a planted form
           * posting a member's session somewhere else.
           */
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "img-src 'self' data: https:",
              "style-src 'self' 'unsafe-inline'",
              "script-src 'self' 'unsafe-inline'",
              "connect-src 'self'",
              "frame-ancestors 'self'",
              /* Nothing on this board embeds a plugin, and `default-src` does
                 not cover `<object>` in every browser that matters. */
              "object-src 'none'",
              /* An injected `<base>` rewrites every relative URL on the page,
                 including the form actions below. */
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
