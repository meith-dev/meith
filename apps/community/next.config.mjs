import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

/**
 * Two directories up from this file's own location by default — correct at
 * the depth every consumer places it at except `boards/stock`, which
 * `FORUM_WORKSPACE_ROOT` overrides (see docs/architecture.md, "The stock
 * board"; docs/development.md, "Consuming the board from a workspace").
 */
const workspaceRoot = process.env.FORUM_WORKSPACE_ROOT
  ? path.resolve(process.env.FORUM_WORKSPACE_ROOT)
  : path.join(here, '../../')

/**
 * The relative equivalent of `workspaceRoot`, for `outputFileTracingIncludes`
 * below — see docs/development.md, "Consuming the board from a workspace",
 * for why that option needs a path relative to this file rather than an
 * absolute one.
 */
const upToWorkspaceRoot = path.relative(here, workspaceRoot).split(path.sep).join('/')

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

  experimental: {
    turbopackFileSystemCacheForDev: false,
  },

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
  /** See docs/development.md, "Consuming the board from a workspace", for why this is set. */
  turbopack: {
    root: workspaceRoot,
  },
  /** Works around a gap in Next's own tracing — see docs/development.md, "Consuming the board from a workspace". */
  outputFileTracingIncludes: {
    '/**': [
      `${upToWorkspaceRoot}/node_modules/.pnpm/@swc+helpers@0.5.23/node_modules/@swc/helpers/**/*`,
    ],
  },
  images: {
    unoptimized: true,
  },
  /**
   * Every `@meith/*` package this app's dependency graph reaches, not just the
   * ones apps/community imports directly — see docs/development.md,
   * "Consuming the board from a workspace", and docs/release.md, "They ship
   * TypeScript source, deliberately".
   */
  transpilePackages: [
    '@meith/accounts',
    '@meith/admin',
    '@meith/antispam',
    '@meith/api',
    '@meith/attachments',
    '@meith/authorization',
    '@meith/avatars',
    '@meith/core',
    '@meith/db',
    '@meith/demo',
    '@meith/drafts',
    '@meith/drivers',
    '@meith/events',
    '@meith/forums',
    '@meith/groups',
    '@meith/i18n',
    '@meith/import',
    '@meith/install',
    '@meith/mail',
    '@meith/markdown',
    '@meith/marketplace',
    '@meith/messages',
    '@meith/moderation',
    '@meith/notifications',
    '@meith/plugin-dues',
    '@meith/plugin-kit',
    '@meith/polls',
    '@meith/posts',
    '@meith/profile-fields',
    '@meith/relations',
    '@meith/reputation',
    '@meith/runtime',
    '@meith/search',
    '@meith/settings',
    '@meith/signatures',
    '@meith/subscriptions',
    '@meith/tasks',
    '@meith/theme-clubhouse',
    '@meith/theme-default',
    '@meith/theme-kit',
    '@meith/theme-midnight',
    '@meith/theme-phasebook',
    '@meith/theme-raidframe',
    '@meith/threads',
    '@meith/ui',
    '@meith/upgrade',
    '@meith/web',
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
