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
  // Turbopack infers a project root by walking up for a lockfile, and
  // otherwise stops at this app's own directory — which for a materialized
  // app (apps/community/bin/forum-web.mjs) is two directories below the
  // real one. Left unset, Turbopack's own Node.js transform pool (postcss,
  // for instance) cannot see the invoking workspace's node_modules at all,
  // and fails with "Cannot find module" for a dependency that plain Node
  // resolution finds without trouble.
  turbopack: {
    root: workspaceRoot,
  },
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
  // Every `@meith/*` package this app's dependency graph reaches — not just
  // the ones apps/community imports directly. All of them ship TypeScript
  // source with no build step (see docs/release.md, "They ship TypeScript
  // source, deliberately"), and inside this monorepo every one of them is
  // resolved through a tsconfig path alias straight to its source file,
  // bypassing node_modules — which is why this list used to be a small,
  // seemingly arbitrary subset: only the packages some other resolution path
  // happened to touch via node_modules ever needed it here.
  //
  // A materialized workspace's own generated tsconfig carries no such alias
  // map (see apps/community/bin/forum-web.mjs) — only `@board/config` and
  // `@board/plugins`, the seam itself. Every other `@meith/*` specifier
  // resolves the ordinary way once this package is npm-installed, which
  // means every one of them needs this same source-compilation treatment,
  // or the build fails with "Unknown module type" on its `src/index.ts`.
  // Computed by walking this app's own imports plus every `@meith/*`
  // package's own "dependencies" transitively — see docs/development.md,
  // "Consuming the board from a workspace".
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
    // Only reached through the `@meith/web/config` subpath, and only from a
    // materialized workspace's own community.config.ts — inside this
    // monorepo apps/community never imports itself by package name. Real
    // once npm resolves this package into another workspace's node_modules,
    // so it needs the same source-compilation treatment as everything else
    // in this list.
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
