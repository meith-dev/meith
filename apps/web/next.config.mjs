const standalone = process.env.SITE_STANDALONE === '1'

const nextConfig = {
  ...(standalone ? { output: 'standalone' } : {}),

  outputFileTracingRoot: new URL('../../', import.meta.url).pathname,

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
