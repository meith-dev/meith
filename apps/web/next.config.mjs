const standalone = process.env.SITE_STANDALONE === '1'

const nextConfig = {
  ...(standalone ? { output: 'standalone' } : {}),

  outputFileTracingRoot: new URL('../../', import.meta.url).pathname,

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
      { source: '/docs/committee-guide', destination: '/docs/organiser-guide', permanent: true },
      { source: '/docs/self-hosting', destination: '/docs/docker-compose', permanent: true },
      { source: '/docs/theme-api', destination: '/docs/themes', permanent: true },
      { source: '/docs/plugin-api', destination: '/docs/plugins', permanent: true },
      { source: '/docs/rest-api', destination: '/docs/api', permanent: true },
      { source: '/docs/nextjs-conventions', destination: '/docs/development', permanent: true },
      { source: '/docs/release', destination: '/docs/development', permanent: true },
      { source: '/docs/word-filter', destination: '/docs/antispam', permanent: true },
      { source: '/docs/ban-filters', destination: '/docs/antispam', permanent: true },
      { source: '/docs/cookies-and-headers', destination: '/docs/operating', permanent: true },
      { source: '/docs/web-push', destination: '/docs/operating', permanent: true },
      { source: '/for/clubs', destination: '/for/communities', permanent: true },
      { source: '/for/neighbourhoods', destination: '/for/communities', permanent: true },
      { source: '/for/discord-and-slack', destination: '/for/communities', permanent: true },
      { source: '/for/facebook-groups', destination: '/for/communities', permanent: true },
      { source: '/for/gaming', destination: '/for/communities', permanent: true },
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
