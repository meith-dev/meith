import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

const workspaceRoot = process.env.FORUM_WORKSPACE_ROOT
  ? path.resolve(process.env.FORUM_WORKSPACE_ROOT)
  : path.join(here, '../../')

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

const FRAMEWORK_PACKAGES = ['next', 'react', 'react-dom']

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
  turbopack: {
    root: workspaceRoot,
  },
  outputFileTracingIncludes: {
    '/**': [
      `${upToWorkspaceRoot}/node_modules/.pnpm/@swc+helpers@0.5.23/node_modules/@swc/helpers/**/*`,
      `${upToWorkspaceRoot}/node_modules/@swc/helpers/**/*`,
    ],
  },
  images: {
    unoptimized: true,
  },
  transpilePackages: [
    '@meith/accounts',
    '@meith/admin',
    '@meith/antispam',
    '@meith/api',
    '@meith/attachments',
    '@meith/authorization',
    '@meith/avatars',
    '@meith/board-digest',
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
    '@meith/plugin-calendar',
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

const boardManifestFile = path.join(workspaceRoot, 'package.json')
if (existsSync(boardManifestFile)) {
  const boardManifest = JSON.parse(readFileSync(boardManifestFile, 'utf8'))
  for (const name of Object.keys(boardManifest.dependencies ?? {})) {
    if (FRAMEWORK_PACKAGES.includes(name)) continue
    if (nextConfig.serverExternalPackages.includes(name)) continue
    if (nextConfig.transpilePackages.includes(name)) continue
    nextConfig.transpilePackages.push(name)
  }
}

export default nextConfig
