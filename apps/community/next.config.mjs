import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

/**
 * Two directories up from this file's own location by default — correct
 * where `forum-web` materializes at `.meith/app` and where this file sits in
 * `apps/community` unmaterialized. `boards/stock` and `forum-web --at-root`
 * are both at other depths, and neither relies on this default:
 * `FORUM_WORKSPACE_ROOT` is set for the first by that board's own scripts
 * and passed on by `forum-web` in every case, so this fallback only applies
 * when the file is read outside that bin entirely (see
 * docs/reference/architecture.md, "The stock board"; docs/contributing/development.md, "Consuming
 * the board from a workspace").
 */
const workspaceRoot = process.env.FORUM_WORKSPACE_ROOT
  ? path.resolve(process.env.FORUM_WORKSPACE_ROOT)
  : path.join(here, '../../')

/**
 * The relative equivalent of `workspaceRoot`, for `outputFileTracingIncludes`
 * below — see docs/contributing/development.md, "Consuming the board from a workspace",
 * for why that option needs a path relative to this file rather than an
 * absolute one. It is `.` rather than the empty string when this file already
 * sits at the workspace root, which is what `forum-web build --at-root`
 * materializes (same section) — an empty prefix would make the glob below
 * read as an absolute path and match nothing.
 */
const upToWorkspaceRoot = path.relative(here, workspaceRoot).split(path.sep).join('/') || '.'

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
  ...(process.env.VERCEL ? {} : { output: 'standalone' }),
  poweredByHeader: false,
  distDir: process.env.FORUM_DIST_DIR ?? '.next',

  serverExternalPackages: [
    '@aws-sdk/client-s3',
    '@aws-sdk/s3-request-presigner',
    '@vercel/blob',
    'postgres',
    '@jsquash/jpeg',
    '@jsquash/png',
    '@jsquash/resize',
    'nodemailer',
  ],
  outputFileTracingRoot: workspaceRoot,
  /** See docs/contributing/development.md, "Consuming the board from a workspace", for why this is set. */
  turbopack: {
    root: workspaceRoot,
  },
  /** Works around a gap in Next's own tracing — see docs/contributing/development.md, "Consuming the board from a workspace". */
  outputFileTracingIncludes: {
    '/**': [
      `${upToWorkspaceRoot}/node_modules/.pnpm/@swc+helpers@0.5.23/node_modules/@swc/helpers/**/*`,
      `${upToWorkspaceRoot}/node_modules/@swc/helpers/**/*`,
    ],
  },
  images: {
    unoptimized: true,
  },
  /**
   * Every `@meith/*` package this app's dependency graph reaches, not just the
   * ones apps/community imports directly — see docs/contributing/development.md,
   * "Consuming the board from a workspace", and docs/contributing/release.md, "They ship
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
