/**
 * The marketing site and documentation, at meith.dev.
 *
 * Deliberately unlike `apps/forum/next.config.mjs`. That app is a board: it
 * reads a database, loads the workspace's `.env` files and ships a standalone
 * server with a worker beside it. This one renders a fixed set of pages from
 * Markdown that is in the repository, so every route is prerendered at build
 * time and nothing here needs configuration, a secret or a connection string.
 *
 * The consequence worth stating: the built output does **not** need `docs/` on
 * disk. The files are read during `next build` and the HTML is baked, so the
 * server that serves this site has no filesystem dependency on the workspace it
 * was built in.
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  /*
   * The board's `distDir` is switchable because Playwright runs a second server
   * beside a developer's own. Nothing does that here, so this stays the default.
   */
  outputFileTracingRoot: new URL("../../", import.meta.url).pathname,

  /*
   * Nothing here needs a file at runtime.
   *
   * `src/docs/load.ts` reads `docs/*.md` and walks up the tree to find the
   * workspace root, which the tracer cannot follow statically — so it gives up
   * and pulls the whole repository into the trace, warning that it has done so.
   * The routes below are the ones that touch it, and every one of them is
   * prerendered: their output is HTML and JSON produced during the build, and the
   * server never re-runs them. Excluding them from tracing drops a repository's
   * worth of files from the deployment and changes nothing about what it serves.
   *
   * If a route here ever stops being static, this entry is what will make it
   * fail — which is the correct direction for that mistake to fail in.
   */
  outputFileTracingExcludes: {
    "/docs": ["**"],
    "/docs/[...slug]": ["**"],
    "/docs/search-index.json": ["**"],
    "/llms.txt": ["**"],
    "/sitemap.xml": ["**"],
  },

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
           * Enforced rather than report-only, which the board cannot yet manage.
           * This site has no third-party script, no analytics and no embed, so
           * the strict policy is simply true of it — and a policy that is true is
           * worth enforcing rather than reporting.
           *
           * `'unsafe-inline'` for styles is Tailwind's inline critical CSS. The
           * one inline script is the theme bootstrap in `app/layout.tsx`, which
           * carries a nonce-free hash-friendly form: it is deliberately tiny and
           * has to run before first paint to avoid a flash of the wrong scheme.
           */
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "img-src 'self' data:",
              "style-src 'self' 'unsafe-inline'",
              "script-src 'self' 'unsafe-inline'",
              "connect-src 'self'",
              "frame-ancestors 'self'",
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
