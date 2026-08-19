import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

const workspaceRoot = path.join(here, '../../')

const loadedEnvFiles = []
for (const name of ['.env.local', '.env']) {
  const file = path.join(workspaceRoot, name)
  if (!existsSync(file)) continue
  process.loadEnvFile(file)
  loadedEnvFiles.push(name)
}

if (process.env.NODE_ENV !== 'production' && loadedEnvFiles.length > 0) {
  console.log(`- Environments: ${loadedEnvFiles.join(', ')} (${workspaceRoot})`)
}

const nextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  distDir: process.env.FORUM_DIST_DIR ?? '.next',

  serverExternalPackages: [
    '@aws-sdk/client-s3',
    '@aws-sdk/s3-request-presigner',
    'postgres',
    '@jsquash/jpeg',
    '@jsquash/png',
    '@jsquash/resize',
    'nodemailer',
  ],
  outputFileTracingRoot: workspaceRoot,
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
  images: {
    unoptimized: true,
  },
  transpilePackages: [
    '@meith/accounts',
    '@meith/authorization',
    '@meith/core',
    '@meith/db',
    '@meith/drivers',
    '@meith/events',
    '@meith/forums',
    '@meith/groups',
    '@meith/polls',
    '@meith/drafts',
    '@meith/posts',
    '@meith/settings',
    '@meith/shared',
    '@meith/tasks',
    '@meith/theme-default',
    '@meith/theme-kit',
    '@meith/threads',
    '@meith/ui',
  ],
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
        ],
      },
    ]
  },
}

export default nextConfig
