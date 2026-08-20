const standalone = process.env.SITE_STANDALONE === '1'

const nextConfig = {
  ...(standalone ? { output: 'standalone' } : {}),

  outputFileTracingRoot: new URL('../../', import.meta.url).pathname,

  // The output-file tracer only follows the CJS half of @swc/helpers' dual
  // package and misses the `esm/` variant next's own require-hook resolves at
  // runtime, so the standalone build ships a `@swc/helpers` directory missing
  // its esm/ half. next resolves the package from its own nested pnpm store
  // entry (node_modules/.pnpm/next@…/node_modules/@swc/helpers), which is a
  // symlink into node_modules/.pnpm/@swc+helpers@0.5.23/node_modules/@swc/helpers
  // — so that is the path that has to be complete, not the app's own copy.
  outputFileTracingIncludes: {
    '/**': ['../../node_modules/.pnpm/@swc+helpers@0.5.23/node_modules/@swc/helpers/**/*'],
  },

  ...(standalone
    ? {}
    : {
        outputFileTracingExcludes: {
          '/': ['**'],
          '/docs': ['**'],
          '/docs/[...slug]': ['**'],
          '/docs/search-index.json': ['**'],
          '/llms.txt': ['**'],
          '/sitemap.xml': ['**'],
        },
      }),

  async redirects() {
    return [
      // The committee's guide became the organiser's guide when the docs
      // stopped assuming every community is a club. The old URL had been
      // published for several releases, so it keeps working.
      { source: '/docs/committee-guide', destination: '/docs/organiser-guide', permanent: true },
    ]
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "img-src 'self' data:",
              "style-src 'self' 'unsafe-inline'",
              `script-src 'self' 'unsafe-inline'${
                process.env.NODE_ENV === 'production' ? '' : " 'unsafe-eval'"
              }`,
              "connect-src 'self'",
              "frame-ancestors 'self'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
        ],
      },
    ]
  },
}

export default nextConfig
