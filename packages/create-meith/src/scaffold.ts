export type ScaffoldTarget = 'self-host' | 'vercel'

export interface ScaffoldOptions {
  readonly name: string
  readonly version: string
  readonly repositoryUrl: string
  readonly target?: ScaffoldTarget
  readonly templateRepositoryUrl?: string
}

export const DEFAULT_REPOSITORY_URL = 'https://github.com/meith-dev/meith'

export const DEFAULT_TEMPLATE_REPOSITORY_URL = 'https://github.com/meith-dev/vercel-template'

export const NEXT_VERSION = '16.3.1'

export const AT_ROOT_FLAG = '--at-root'

export const MATERIALIZED_AT_ROOT = [
  'app',
  'src',
  'public',
  'next.config.mjs',
  'postcss.config.mjs',
  'components.json',
  'instrumentation.ts',
  'proxy.ts',
  'tsconfig.json',
  'next-env.d.ts',
]

export const VERCEL_BUILD_COMMAND = `community migrate && forum-web build ${AT_ROOT_FLAG}`

export const TICK_PATH = '/api/system/tick'

export const TICK_SCHEDULE = '* * * * *'

export const MATERIALIZED_PUBLIC = [
  'placeholder-logo.png',
  'placeholder-logo.svg',
  'placeholder-user.jpg',
  'placeholder.jpg',
  'placeholder.svg',
  'sw.js',
]

const AT_ROOT_IGNORE_PATHS = MATERIALIZED_AT_ROOT.flatMap((entry) =>
  entry === 'public' ? MATERIALIZED_PUBLIC.map((file) => `/public/${file}`) : [`/${entry}`],
).join('\n')

const AT_ROOT_IGNORES = `# What \`forum-web ${AT_ROOT_FLAG}\` writes into this directory: @meith/web's own
# Next app, materialized here rather than into .meith/app so that the build
# artefact lands at ./.next, where Vercel's Next.js builder reads it. Every
# path here belongs to the framework and is rewritten on every build.
#
# public/ is listed file by file rather than as a directory, because that one
# is shared: forum-web decides what it owns per file, so this board's own
# public/ads.txt, public/.well-known/... or domain-verification file sits
# beside the framework's and is tracked normally. The rest of these names the
# framework owns outright — a build refuses rather than overwriting a file it
# did not write, and names it.
${AT_ROOT_IGNORE_PATHS}`

const NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,213}$/

export function validateName(name: string): string | null {
  if (name === '') return 'A project name is required.'
  if (name === '.' || name === '..') return 'That name would write outside the new directory.'
  if (name.includes('/') || name.includes('\\'))
    return 'A project name cannot contain a path separator.'
  if (name !== name.toLowerCase()) return 'npm package names must be lower-case.'
  if (!NAME_PATTERN.test(name)) {
    return 'Use lower-case letters, digits, dots, hyphens and underscores, starting with a letter or digit.'
  }
  return null
}

const ENV_REQUIRED_HEADING = `# ─── Required ────────────────────────────────────────────────────────────────`

const ENV_OPTIONAL_HEADING = `# ─── Optional ────────────────────────────────────────────────────────────────`

const ENV_DATABASE_URL_PROSE = `# Your Postgres connection string.
#
# If it is a managed database that offers a TRANSACTION-MODE POOLER string, use
# that rather than the direct one — Neon, Supabase and their kind hand out both,
# and on the direct string a board works in testing and starts refusing
# connections under the first real traffic, with an error that names the
# database rather than the cause. Your own Postgres, with a fixed number of
# processes in front of it, does not need one.`

const ENV_DIRECT_DATABASE_URL_PROSE = `# The other half of that pair: the DIRECT (non-pooler) string, used only by
# \`community migrate\` and \`community backup\`. Migrations hold a session-level
# advisory lock so that two deploys landing together queue instead of both
# applying the same migration, and a transaction-mode pooler cannot hold that
# lock: it takes the connection back the moment the lock statement ends, which
# leaves the lock on a backend another client gets. Set both and each gets the
# connection it needs; set only DATABASE_URL and migrations use it too, which is
# right for a Postgres you run yourself.`

const ENV_AUTH_SECRET_PROSE = `# Session and token signing. No default, deliberately: a shipped default is a
# board every reader of the source can sign a session for.
#
#   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`

const ENV_TICK_SECRET_PROSE = `# The shared secret the tick caller presents to GET /api/system/tick. Generate
# it the same way. Without it the tick is unauthenticated, and the tick is how
# bans expire and digests send.`

const ENV_DATA_SOURCE_PROSE = `# fixture = deterministic in-memory sample data, no database needed. This is
# what \`npm run build\` uses, and what a checkout with no database falls back to.`

const ENV_APP_URL_PROSE = `# Absolute, no trailing slash. Used in mail, feeds and canonical URLs — every
# place a relative URL cannot work because there is no request to be relative to.
#
# Optional: leave it blank and the installer asks, prefilled from the address you
# load /install at, and stores the answer on the board where the settings screen
# can change it without a redeploy. Set it here and it wins outright.`

const ENV_SMTP_MAIL_BLOCK = `# Mail. Leave these alone and the installer asks for mail on first run, storing
# it on the board — a settings screen with a test button, no redeploy. Set
# MAIL_DRIVER here instead and the environment wins outright, which is what you
# want if the credential must not live in the database.
#
# The default sends NOTHING: each message goes to the server log, so password
# reset fails silently until mail is configured one way or the other.
# MAIL_DRIVER=smtp
# MAIL_SMTP_HOST=smtp.example.com
# MAIL_SMTP_PORT=465
# MAIL_SMTP_SECURITY=tls        # tls (465) | starttls (587) | none
# MAIL_SMTP_USERNAME=
# MAIL_SMTP_PASSWORD=
# MAIL_FROM=noreply@yourdomain.com`

function selfHostEnvExample(name: string): string {
  return `# ${name} — environment.
#
# Copy to .env.local for development. On the server this is \`.env\` beside the
# compose file; nothing here belongs in git.

${ENV_REQUIRED_HEADING}

${ENV_DATABASE_URL_PROSE}
DATABASE_URL=

${ENV_DIRECT_DATABASE_URL_PROSE}
# DIRECT_DATABASE_URL=

${ENV_AUTH_SECRET_PROSE}
AUTH_SECRET=

${ENV_TICK_SECRET_PROSE}
TICK_SECRET=

${ENV_OPTIONAL_HEADING}

${ENV_DATA_SOURCE_PROSE}
DATA_SOURCE=postgres

${ENV_APP_URL_PROSE}
APP_URL=

${ENV_SMTP_MAIL_BLOCK}

`
}

function vercelEnvExample(name: string): string {
  return `# ${name} — environment, on Vercel.
#
# Nothing on Vercel reads this file. The platform holds each of these as a
# project environment variable, and the Deploy Button in README.md asks for the
# ones it cannot provision itself. This is the reference for what they mean —
# and the file to copy to .env.local to run the same board on your own machine.

# ─── Drivers ─────────────────────────────────────────────────────────────────

# An instance is created for a request, may be frozen between requests, and is
# destroyed without warning; it has a writable /tmp nothing else can read and no
# background process of its own. Every driver below therefore keeps its state
# somewhere outside the instance, and these five values are not a default to
# tune — they are the one combination the board supports on functions.
#
# DATA_SOURCE=fixture is a read-only sample board with no write side.
# QUEUE_DRIVER=memory loses every queued job when the instance goes away, which
# is after almost every request, and the board already refuses it in production.
# CACHE_DRIVER=next and memory cache inside the process, so each instance serves
# its own stale copy for up to a minute. FILESTORE_DRIVER=local writes to a disk
# no other instance can read and that is discarded with the instance — on Vercel
# the board refuses it outright rather than losing uploads quietly.
DATA_SOURCE=postgres
QUEUE_DRIVER=postgres
CACHE_DRIVER=redis
FILESTORE_DRIVER=s3
MAIL_DRIVER=http

${ENV_REQUIRED_HEADING}

${ENV_DATABASE_URL_PROSE}
DATABASE_URL=

${ENV_DIRECT_DATABASE_URL_PROSE}
#
# On Vercel this is not optional. DATABASE_URL here is the pooler string, the
# build runs \`community migrate\` against it, and /install takes the second of
# those two session locks on first run. Neon publishes the direct string as
# DATABASE_URL_UNPOOLED; copy that value into this variable.
DIRECT_DATABASE_URL=

# The shared cache — a Redis or Valkey endpoint, \`rediss://\` for TLS. Redis
# holds cache entries and nothing else: losing it costs the board a warm cache,
# not data, and signs nobody out. A store provisioned with the board publishes
# its own connection variable; copy that value into this one.
REDIS_URL=

${ENV_AUTH_SECRET_PROSE}
AUTH_SECRET=

${ENV_TICK_SECRET_PROSE}
#
# Vercel Cron sends \`Authorization: Bearer <CRON_SECRET>\` and cannot be told to
# send any other name, so CRON_SECRET is the one to set here. The board accepts
# either name, and both when both are set. Whichever you use, 32 characters is
# the floor — stricter than the 16 Vercel's own cron documentation suggests, so
# a secret generated by following those instructions is rejected here.
CRON_SECRET=
# TICK_SECRET=

# Uploads, in any S3-compatible bucket. The first four are required whenever
# FILESTORE_DRIVER=s3, and boot fails naming any that are missing. S3_ENDPOINT
# is for anything that is not AWS — R2, MinIO, Spaces — and switches the client
# to path-style addressing; set S3_REGION=auto for R2. S3_PUBLIC_BASE_URL is the
# host objects are *served* from when that is not the API endpoint: an r2.dev
# domain, a custom domain, or a CDN in front of the bucket.
#
# An upload is held whole in the instance's memory on the way in and on the way
# out, so the function's memory limit, not the bucket, is what caps a file.
S3_BUCKET=
S3_REGION=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
# S3_ENDPOINT=
# S3_PUBLIC_BASE_URL=

# Mail over the provider's own HTTPS API, on 443 — the one outbound path a
# function can rely on. SMTP on port 25 is blocked by serverless egress and the
# board refuses it on Vercel; 587 with STARTTLS may work, but an API does not
# depend on the platform's egress rules staying as they are.
MAIL_FROM=
MAIL_HTTP_ENDPOINT=
MAIL_HTTP_TOKEN=

${ENV_OPTIONAL_HEADING}

${ENV_APP_URL_PROSE}
APP_URL=

`
}

function envExample(name: string, target: ScaffoldTarget): string {
  return target === 'vercel' ? vercelEnvExample(name) : selfHostEnvExample(name)
}

const SELF_HOST_DEPLOY_KIT = [
  '.dockerignore',
  '.github/workflows/build.yml',
  'Dockerfile',
  'docker-compose.yml',
  'docker-entrypoint.sh',
  'docker-healthcheck.sh',
] as const

const VERCEL_FIXED_DRIVERS = [
  'DATA_SOURCE=postgres',
  'QUEUE_DRIVER=postgres',
  'CACHE_DRIVER=redis',
  'FILESTORE_DRIVER=s3',
  'MAIL_DRIVER=http',
] as const

export const VERCEL_PROMPTED_ENV = [
  'DATA_SOURCE',
  'QUEUE_DRIVER',
  'CACHE_DRIVER',
  'FILESTORE_DRIVER',
  'MAIL_DRIVER',
  'DIRECT_DATABASE_URL',
  'REDIS_URL',
  'AUTH_SECRET',
  'CRON_SECRET',
  'S3_BUCKET',
  'S3_REGION',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
  'MAIL_FROM',
  'MAIL_HTTP_ENDPOINT',
  'MAIL_HTTP_TOKEN',
] as const

export const VERCEL_MARKETPLACE_STORES = [
  { type: 'integration', integrationSlug: 'neon', productSlug: 'neon', protocol: 'storage' },
  {
    type: 'integration',
    integrationSlug: 'upstash',
    productSlug: 'upstash-kv',
    protocol: 'storage',
  },
] as const

export function deployButtonUrl(templateRepositoryUrl: string): string {
  const params = new URLSearchParams([
    ['repository-url', templateRepositoryUrl],
    ['project-name', 'meith-board'],
    ['repository-name', 'meith-board'],
    ['env', VERCEL_PROMPTED_ENV.join(',')],
    [
      'envDescription',
      'Five fixed driver values, two secrets to generate, the direct database URL, the cache URL, and your own bucket and mail API.',
    ],
    ['envLink', `${templateRepositoryUrl}/blob/main/.env.example`],
    ['stores', JSON.stringify(VERCEL_MARKETPLACE_STORES)],
    ['skippable-integrations', '1'],
  ])

  return `https://vercel.com/new/clone?${params.toString()}`
}

function vercelJson(): string {
  return `${JSON.stringify(
    {
      framework: 'nextjs',
      buildCommand: VERCEL_BUILD_COMMAND,
      crons: [{ path: TICK_PATH, schedule: TICK_SCHEDULE }],
    },
    null,
    2,
  )}\n`
}

export function scaffold(options: ScaffoldOptions): ReadonlyMap<string, string> {
  const { name, version, repositoryUrl } = options
  const target = options.target ?? 'self-host'
  const atRootFlag = target === 'vercel' ? ` ${AT_ROOT_FLAG}` : ''
  const files = new Map<string, string>()

  files.set(
    'package.json',
    `${JSON.stringify(
      {
        name,
        version: '0.1.0',
        private: true,
        type: 'module',
        scripts: {
          dev: `forum-web dev${atRootFlag}`,
          build: `forum-web build${atRootFlag}`,
          start: `forum-web start${atRootFlag}`,
          community: 'community',
        },
        dependencies: {
          '@meith/web': version,
          '@meith/cli': version,
          '@meith/theme-default': version,
          next: NEXT_VERSION,
        },
        engines: { node: '>=22' },
      },
      null,
      2,
    )}\n`,
  )

  files.set(
    '.npmrc',
    `# Every @meith/* dependency here is an exact version, not a range — see
# README.md, "Upgrading", for why a range breaks the build. This makes that
# the default for any \`npm install\` run in this project from here on,
# including a plugin installed by hand later, not only the four packages
# the scaffold pinned itself.
save-exact=true
`,
  )

  files.set(
    'community.config.ts',
    `/**
 * The board's build-time registry.
 *
 * Everything installable is named here, statically, so the bundler can see it
 * and the compiler can check it. Nothing is discovered by scanning a directory
 * at runtime — a production build contains only what the bundler could see, so a
 * directory walked at request time is empty and a plugin "installed" that way is
 * not there at all.
 *
 * Adding a theme is: \`npm install\` it, add a line here, redeploy. Adding a
 * plugin is the same, through board.plugins.json and community.plugins.ts —
 * see docs/plugin-api.md.
 */
import { defineForumConfig } from '@meith/web/config'
import {
  BROWSER_THEME_COLOR,
  DARK_TOKENS,
  defaultTheme,
  LIGHT_TOKENS,
} from '@meith/theme-default'

import { INSTALLED_PLUGINS } from './community.plugins'

export default defineForumConfig({
  themes: {
    default: {
      key: 'default',
      title: 'Default',
      tokens: { light: LIGHT_TOKENS, dark: DARK_TOKENS },
      browserThemeColor: BROWSER_THEME_COLOR,
      theme: defaultTheme,
    },
  },
  defaultTheme: 'default',

  plugins: INSTALLED_PLUGINS,
})
`,
  )

  files.set('board.plugins.json', `${JSON.stringify({ plugins: [] }, null, 2)}\n`)

  files.set(
    'community.plugins.ts',
    `/**
 * The board's installed-plugin list.
 *
 * Inside the Meith monorepo this file is generated from board.plugins.json
 * by \`pnpm board:gen\` (see docs/plugin-api.md) — that generator is
 * repository tooling, not something this workspace carries, so this file
 * starts as a plain, valid file with the same shape instead. Add a plugin by
 * importing its \`plugin\`/\`messages\` exports and adding an entry:
 *
 *   import { messages as greeterMessages, plugin as greeterPlugin } from '@meith/plugin-greeter'
 *
 *   export const INSTALLED_PLUGINS: readonly InstalledPlugin<PluginDefinition>[] = [
 *     { key: 'greeter', enabled: true, plugin: greeterPlugin, messages: greeterMessages },
 *   ]
 *
 * and the matching entry in board.plugins.json, which is what
 * \`community plugin:add\`/\`plugin:remove\` read inside the monorepo — kept
 * here too so the two files agree about what is installed.
 */
import type { InstalledPlugin } from '@meith/web/config'

export const INSTALLED_PLUGINS: readonly InstalledPlugin[] = []

export function installedPluginDefinitions() {
  return INSTALLED_PLUGINS.filter(
    (entry) => entry.enabled !== false && entry.plugin !== undefined,
  ).map((entry) => entry.plugin)
}
`,
  )

  files.set('.env.example', envExample(name, target))

  files.set(
    '.gitignore',
    `node_modules
.next
.meith
.env
.env.local
.env*.local
*.log
.DS_Store
`,
  )

  files.set(
    'Dockerfile',
    `# syntax=docker/dockerfile:1.7-labs
# check=skip=InvalidDefaultArgInFrom
# ${name}'s deploy image.
#
# FROM the published framework base image — deps + framework layers only,
# locked to this exact release (see the meith repository's
# docs/self-hosting.md, "Custom boards", and docker/Dockerfile.base for what
# it is and is not). This board's own Dockerfile only ever installs its own
# delta on top of it — a new plugin's own dependency, typically nothing more
# — which is what keeps a rebuild after \`npm install some-plugin\` a matter
# of minutes rather than a cold toolchain build.
#
# Two stages, not three: unlike the official image, this does not prune down
# to Next's own standalone output. The migrate role below runs \`community
# migrate\`, and \`community\` materializes @meith/cli's sources and runs them
# with tsx at the moment it runs (see the meith repository's
# docs/development.md, "Consuming the board from a workspace") — it needs
# the full, un-pruned node_modules tree this board installed, not what Next
# traced as reachable from the web server alone. The tick itself is driven
# by docker-compose.yml's own \`worker\` service — a lightweight loop against
# /api/system/tick, not a compiled worker process, because @meith/worker is
# not published (see the meith repository's docs/release.md).
ARG MEITH_VERSION
FROM ghcr.io/meith-dev/meith-base:\${MEITH_VERSION} AS deps
WORKDIR /board

# This board's own manifest, cached independently of its source — editing
# community.config.ts should not re-run npm install. The base image above
# already carries node_modules for @meith/web, @meith/cli and
# @meith/theme-default at this exact version, so installing this file on top
# of it only fetches what changed: a plugin newly added to \`dependencies\`,
# typically nothing at all.
COPY package.json ./
RUN npm install

FROM deps AS runtime
WORKDIR /board
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# DATA_SOURCE is scoped to this one RUN, not declared with ENV — an ENV
# persists into every container started from this image afterward, and this
# Dockerfile has no later stage to reset it in (see "Two stages, not three"
# above). The build needs neither a database nor a production secret (see
# the meith repository's docs/development.md, "Fixture mode"), but baking
# DATA_SOURCE=fixture into the image itself would silently force fixture
# mode — and with it the in-memory queue driver — at runtime too, no matter
# what DATABASE_URL an operator supplies to \`docker run\`.
RUN DATA_SOURCE=fixture npx forum-web build

ENV PORT=3000
ENV HOSTNAME=0.0.0.0
EXPOSE 3000

# node:alpine already carries a non-root "node" user; the board's own files
# are copied in as root above, so they need handing over before this drops
# privilege.
RUN chown -R node:node /board
USER node

COPY --chown=node:node docker-entrypoint.sh docker-healthcheck.sh ./
RUN chmod +x docker-entrypoint.sh docker-healthcheck.sh

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \\
  CMD ["./docker-healthcheck.sh"]

ENTRYPOINT ["./docker-entrypoint.sh"]
`,
  )

  files.set(
    'docker-entrypoint.sh',
    `#!/bin/sh
# One image, two roles — see Dockerfile and README.md.
#
# "web" (the default) runs the board; "migrate" applies the schema and
# exits. There is no "worker" role in this image: @meith/worker is not
# published, so nothing here can run it — docker-compose.yml's own \`worker\`
# service drives the tick a different way, calling this image's web role
# over HTTP instead of running as a role of this image.
set -e

# An explicit command wins over the role, the same as the official image —
# \`docker run <image> node_modules/.bin/community --help\` should still run
# the CLI rather than silently starting the web server.
if [ "$#" -gt 0 ]; then
  exec "$@"
fi

case "\${COMMUNITY_ROLE:-web}" in
  migrate)
    # Runs to completion and exits; compose's one-shot service waits on it.
    exec node_modules/.bin/community migrate
    ;;
  web)
    exec node_modules/.bin/forum-web start
    ;;
  *)
    echo "Unknown COMMUNITY_ROLE: \${COMMUNITY_ROLE}. Expected 'web' or 'migrate'." >&2
    exit 1
    ;;
esac
`,
  )

  files.set(
    'docker-healthcheck.sh',
    `#!/bin/sh
# What "healthy" means depends on the role — see docker-entrypoint.sh.
# "migrate" runs to completion and exits; its exit code is the verdict, and
# a health probe taken while it runs has no opinion.
set -e

if [ "\${COMMUNITY_ROLE:-web}" = "migrate" ]; then
  exit 0
fi

node -e "fetch('http://127.0.0.1:3000/api/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
`,
  )

  files.set(
    '.dockerignore',
    `node_modules
.next
.meith
.git
.env
.env.local
*.log
`,
  )

  files.set(
    '.github/workflows/build.yml',
    `# Builds this board's image and pushes it to your own GHCR, on every push to
# main. No secret to configure: GITHUB_TOKEN is provided automatically by
# GitHub Actions and is enough to push to ghcr.io/<this repository>. See
# README.md for the rest of the three-step deploy story.
name: Build and push

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  packages: write

jobs:
  image:
    name: Build and push the board image
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7

      - uses: docker/login-action@dbcb813823bdd20940b903addbd779551569679f # v4
        with:
          registry: ghcr.io
          username: \${{ github.actor }}
          password: \${{ secrets.GITHUB_TOKEN }}

      # GHCR requires a lower-case image name, and neither your GitHub
      # username nor this repository's name is guaranteed to be.
      - name: Build and push
        run: |
          IMAGE=$(echo "ghcr.io/\${{ github.repository }}" | tr '[:upper:]' '[:lower:]')
          MEITH_VERSION=$(node -p "require('./package.json').dependencies['@meith/web']")
          if ! echo "$MEITH_VERSION" | grep -Eq '^[0-9]+\\.[0-9]+\\.[0-9]+$'; then
            echo "::error::@meith/web in package.json is '$MEITH_VERSION', not an exact X.Y.Z version — that is not a legal Docker image tag. Upgrade with \\\`npm install --save-exact\\\` (see README.md, Upgrading) so this dependency always resolves to one."
            exit 1
          fi
          docker build --build-arg MEITH_VERSION="$MEITH_VERSION" -t "$IMAGE:\${{ github.sha }}" -t "$IMAGE:latest" .
          docker push "$IMAGE:\${{ github.sha }}"
          docker push "$IMAGE:latest"

      - name: Summary
        run: |
          IMAGE=$(echo "ghcr.io/\${{ github.repository }}" | tr '[:upper:]' '[:lower:]')
          REPO_LOWER=$(echo "\${{ github.repository }}" | tr '[:upper:]' '[:lower:]')
          PKG_NAME=$(echo "$REPO_LOWER" | cut -d/ -f2)
          PKG_URL="https://github.com/$REPO_LOWER/pkgs/container/$PKG_NAME"
          {
            echo "## Deploy this image"
            echo
            echo "Paste this into the MEITH_IMAGE variable on the Coolify resource:"
            echo
            echo "    $IMAGE:\${{ github.sha }}"
            echo
            echo "This tag names this run's build and nothing else, ever. $IMAGE:latest"
            echo "also pushed, as a convenience for a quick manual pull; it moves on"
            echo "every push to main, so any later Coolify redeploy — for any reason,"
            echo "not necessarily this one — pulls whatever main most recently built,"
            echo "including a commit still mid-feature. Prefer the sha above for the"
            echo "value you actually set on the resource."
            echo
            echo "## One-time: make the package public"
            echo
            echo "This package starts private. Coolify's pull fails until you visit"
            echo "$PKG_URL and change its visibility — **Package settings** →"
            echo "**Change visibility** → **Public**."
          } >> "$GITHUB_STEP_SUMMARY"
`,
  )

  files.set(
    'docker-compose.yml',
    `# ${name}, deployed by Coolify — the same shape as the meith repository's own
# docker/compose.coolify.yml: db, migrate, web, worker. See README.md for
# the three-step deploy story this file is the last step of.
#
# No published ports — Coolify's proxy routes to the container and issues
# the certificate. The two secrets and the database password are Coolify's
# own "magic variables": it fills them in on the first deploy and shows them
# in the panel, so nothing here needs a value typed into it except
# MEITH_IMAGE, which only you can know — the build workflow's own Summary
# tab prints it, ready to paste, the moment it finishes. Requires Coolify
# v4.0.0-beta.411 or newer, which is when magic variables in a compose file
# from a Git source arrived.
services:
  postgres:
    image: postgres:18-alpine@sha256:d3e1620b530c944afa6e887d22eb899824da68e19c52024bf98f5220c88a65b2
    restart: unless-stopped
    mem_limit: \${POSTGRES_MEM_LIMIT:-1g}
    cpus: \${POSTGRES_CPUS:-1}
    environment:
      POSTGRES_USER: community
      POSTGRES_PASSWORD: $SERVICE_PASSWORD_POSTGRES
      POSTGRES_DB: community
    volumes:
      - pgdata:/var/lib/postgresql
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U community -d community']
      interval: 10s
      timeout: 5s
      retries: 5

  # Runs to completion, then exits. web waits for it, so the schema is
  # always applied before the first request rather than racing it.
  migrate:
    image: \${MEITH_IMAGE:?set this to the image the build workflow's Summary just printed, e.g. ghcr.io/<you>/${name}:latest}
    environment:
      COMMUNITY_ROLE: migrate
      DATABASE_URL: postgres://community:$SERVICE_PASSWORD_POSTGRES@postgres:5432/community
      AUTH_SECRET: $SERVICE_BASE64_64_AUTH
      TICK_SECRET: $SERVICE_BASE64_64_TICK
    depends_on:
      postgres:
        condition: service_healthy
    restart: 'no'

  web:
    image: \${MEITH_IMAGE:?set this to the image the build workflow's Summary just printed, e.g. ghcr.io/<you>/${name}:latest}
    restart: unless-stopped
    mem_limit: \${WEB_MEM_LIMIT:-1g}
    cpus: \${WEB_CPUS:-2}
    environment:
      # Ask Coolify for a domain on port 3000, then hand the board the same
      # thing with a scheme in front.
      - SERVICE_FQDN_WEB_3000
      - APP_URL=$SERVICE_URL_WEB
      - DATABASE_URL=postgres://community:$SERVICE_PASSWORD_POSTGRES@postgres:5432/community
      - AUTH_SECRET=$SERVICE_BASE64_64_AUTH
      - TICK_SECRET=$SERVICE_BASE64_64_TICK
      - QUEUE_DRIVER=postgres
      - CACHE_DRIVER=next
      - FILESTORE_DRIVER=local
      # Left unset, mail is configured on the board itself — the installer
      # asks on first run. Set MAIL_DRIVER here and this file wins instead.
      - MAIL_DRIVER=\${MAIL_DRIVER:-log}
      - MAIL_SMTP_HOST=\${MAIL_SMTP_HOST:-}
      - MAIL_SMTP_PORT=\${MAIL_SMTP_PORT:-}
      - MAIL_SMTP_SECURITY=\${MAIL_SMTP_SECURITY:-}
      - MAIL_SMTP_USERNAME=\${MAIL_SMTP_USERNAME:-}
      - MAIL_SMTP_PASSWORD=\${MAIL_SMTP_PASSWORD:-}
      - MAIL_FROM=\${MAIL_FROM:-}
    volumes:
      - uploads:/app/.uploads
    depends_on:
      postgres:
        condition: service_healthy
      migrate:
        condition: service_completed_successfully

  # @meith/worker is not published (see the meith repository's
  # docs/release.md), so there is no compiled worker binary a scaffolded
  # board can run — this drives the tick the alternative way the meith
  # repository documents in docs/self-hosting.md, "Running the tick without
  # a second set of credentials": a small loop calling /api/system/tick.
  worker:
    image: alpine:3.24@sha256:28bd5fe8b56d1bd048e5babf5b10710ebe0bae67db86916198a6eec434943f8b
    restart: unless-stopped
    mem_limit: \${WORKER_MEM_LIMIT:-64m}
    cpus: \${WORKER_CPUS:-0.25}
    environment:
      TICK_SECRET: $SERVICE_BASE64_64_TICK
    command:
      - sh
      - -c
      - |
        apk add --no-cache curl >/dev/null
        while true; do
          curl -fsS -m 55 -H "Authorization: Bearer $$TICK_SECRET" \\
            http://web:3000/api/system/tick >/dev/null 2>&1 \\
            || echo "tick failed at $$(date -Is)"
          sleep 60
        done
    depends_on:
      - web

volumes:
  pgdata:
  uploads:
`,
  )

  files.set(
    'README.md',
    `# ${name}

A forum, built on [Meith](${repositoryUrl}).

## Deploy

Nothing here builds on your own server — a 2 GB VPS OOMs on a Next.js build,
which is the whole reason \`Dockerfile\`, \`docker-compose.yml\` and
\`.github/workflows/build.yml\` exist: something else builds the image, the
server only ever pulls one. Three steps, nothing to configure by hand beyond
one value only you know:

1. **Push this repository to GitHub.** \`.github/workflows/build.yml\` builds
   \`Dockerfile\` on every push to \`main\` and pushes the result to your own
   GitHub Container Registry, \`ghcr.io/<you>/${name}\` — using only the
   \`GITHUB_TOKEN\` every GitHub Actions run already carries. No secret to
   add, no registry account beyond the GitHub account you already have.

   Open the run under the repository's **Actions** tab once it finishes —
   its **Summary** prints the two things left: the exact image to paste
   into step 2 below, and a direct link to the one-time step of making the
   package public. It starts **private**, and Coolify's pull fails with an
   authentication error no operator can act on until that is done.

2. **Point [Coolify](https://coolify.io) at \`docker-compose.yml\`** — a Docker
   Compose resource, this repository as its source. \`docker-compose.yml\` already
   carries Coolify's own "magic variables" for \`AUTH_SECRET\`,
   \`TICK_SECRET\` and the database password, generated on the first deploy
   and never typed in. The one thing Coolify cannot generate is the image
   step 1 just pushed: set \`MEITH_IMAGE\` in the resource's own environment
   to the value that run's Summary printed — \`ghcr.io/<you>/${name}:\${{ github.sha }}\`,
   a pin that only ever names that one build (\`docker-compose.yml\` refuses
   to start without this set, with a message saying why). The same run also
   pushes \`ghcr.io/<you>/${name}:latest\` as a convenience for a quick manual
   pull, but it moves on every push to \`main\` — set it on the resource and a
   later, unrelated redeploy can pull whatever \`main\` most recently built,
   commit still mid-feature included.

3. **Deploy, then \`/install\` on your own domain.** Coolify issues the
   certificate; the installer from there is the one
   [docs/quickstart.md](${repositoryUrl}/blob/main/docs/quickstart.md#4-run-the-installer)
   walks through, screen for screen. It seals itself when it finishes, and
   \`/install\` answers 404 from then on — run it **against the database you
   are going to keep**. Every push to \`main\` after this rebuilds the
   image; Coolify's own **Redeploy** button is what actually pulls it —
   pushing alone does not.

No Docker Hub, no paid CI: GitHub Actions' free tier and GHCR are the whole
build side of this, for a board of any size.

**Building it yourself**: works on any machine with Docker, if you would
rather not use GitHub Actions for the build — push the result wherever
\`docker-compose.yml\`'s \`MEITH_IMAGE\` can reach.

\`\`\`sh
docker build --build-arg MEITH_VERSION=$(node -p "require('./package.json').dependencies['@meith/web']") -t ${name} .
\`\`\`

**Without a panel**: [docs/self-hosting.md](${repositoryUrl}/blob/main/docs/self-hosting.md)
is the same four containers by hand — your own \`.env\`, a reverse proxy you
already run, no Coolify. \`Dockerfile\` and \`docker-compose.yml\` here are this
board's own version of exactly that shape.

Two things nothing configures for you:

- **Mail.** Until \`MAIL_DRIVER\` and its three settings exist, every message is
  written to the log and delivered to nobody, so password reset fails silently.
- **The tick.** \`docker-compose.yml\`'s \`worker\` service drives it here — a small
  loop calling \`/api/system/tick\` once a minute, since \`@meith/web\`'s own
  worker package is not something a board outside the meith monorepo can
  depend on yet. Deploy some other way and something still has to call that
  route (or run \`community task:run\`) every minute, or nothing catches up
  and nothing errors.

## Local

\`\`\`sh
npm install
cp .env.example .env.local
npm run dev
\`\`\`

With no \`DATABASE_URL\`, the board runs on deterministic in-memory sample data —
enough to click through every reading surface. Posting needs a database:

\`\`\`sh
npm run community -- migrate
echo "<password>" | npm run community -- user:create --username <name> --email <address> --group administrators
\`\`\`

## Configuring

- **\`community.config.ts\`** — installed themes and plugins. Everything installable
  is named here so the bundler can see it; nothing is found by scanning a
  directory at runtime.
- **\`/admin\`** — settings, forums, groups, members, themes, maintenance. An
  administrator re-enters their password to get in, and again for anything
  destructive.
- **\`npm run community -- --help\`** — the operator CLI. Everything the panel does
  and a few things it cannot, without a browser.

## Upgrading

\`\`\`sh
npm install --save-exact @meith/web@latest @meith/cli@latest @meith/theme-default@latest
npm install --save-exact next@$(node -p "require('./node_modules/@meith/web/package.json').dependencies.next")
git commit -am "Upgrade Meith and the Next.js version it builds with"
git push
\`\`\`

The second command is not optional. This board pins \`next\` itself, and
nothing bumps it for you: upgrading only the \`@meith/*\` packages leaves the
board's own pin on the old Next while \`@meith/web\` depends on the new one,
which npm resolves by installing both — the build then runs on one version
while everything reading \`package.json\` sees the other. Reading the version
out of the freshly installed \`@meith/web\` is what keeps the two the same
without anybody having to know the number.

That \`package.json\` change is the whole pin: \`Dockerfile\`'s own
\`FROM\` line takes the version as a build argument, and
\`.github/workflows/build.yml\` reads it straight out of \`package.json\`'s
own \`@meith/web\` dependency when it rebuilds — nothing in \`Dockerfile\`
itself to keep in sync by hand. \`--save-exact\` matters: npm's default
\`save-prefix\` is \`^\`, and a caret range is not a legal Docker image tag —
without it, this exact command would write \`"^0.18.0"\` and the next build
would fail with \`invalid reference format\` instead of building. This
project's own \`.npmrc\` sets \`save-exact=true\` for the same reason, so an
\`npm install\` of anything else here — a plugin, say — stays pinned too; the
build workflow also refuses to build from anything but an exact version, as
a second line of defense. Once the rebuilt image is deployed, run
\`npm run community -- upgrade\` against it for the plugin migrations — see
[the operator CLI](${repositoryUrl}/blob/main/docs/operating.md#the-operator-cli)
for running it against this deployment.

Migrations are forward-only. Recovery is by restore, so take a backup first —
there is no down migration to undo a destructive one, and a button that pretended
otherwise would be worse than its absence.
`,
  )

  if (target === 'vercel') {
    return vercelTree(files, {
      name,
      repositoryUrl,
      templateRepositoryUrl: options.templateRepositoryUrl ?? DEFAULT_TEMPLATE_REPOSITORY_URL,
    })
  }

  return files
}

interface VercelTreeOptions {
  readonly name: string
  readonly repositoryUrl: string
  readonly templateRepositoryUrl: string
}

function vercelTree(
  base: ReadonlyMap<string, string>,
  options: VercelTreeOptions,
): ReadonlyMap<string, string> {
  const files = new Map(base)

  for (const path of SELF_HOST_DEPLOY_KIT) files.delete(path)

  files.set(
    '.gitignore',
    `node_modules
.next
.meith
.vercel
.env
.env.local
.env*.local
*.log
.DS_Store

${AT_ROOT_IGNORES}
`,
  )

  files.set('vercel.json', vercelJson())
  files.set('README.md', vercelReadme(options))

  return files
}

function vercelReadme({ name, repositoryUrl, templateRepositoryUrl }: VercelTreeOptions): string {
  return `# ${name}

A forum, built on [Meith](${repositoryUrl}), running as Vercel functions.

[![Deploy with Vercel](https://vercel.com/button)](${deployButtonUrl(templateRepositoryUrl)})

## What the button provisions

- **A copy of this repository** under your own GitHub account. Vercel builds
  from it, and every later push to \`main\` redeploys.
- **A Neon Postgres database**, attached to the project. Neon publishes the
  pooled connection string as \`DATABASE_URL\` and the direct one as
  \`DATABASE_URL_UNPOOLED\`.
- **An Upstash Redis store**, attached the same way, for the shared cache.
- **A Vercel project** carrying \`vercel.json\` — the build command
  \`${VERCEL_BUILD_COMMAND}\`,
  which applies the schema before it builds, materializes the board's app at
  the project root so the artefact lands where Vercel reads it, and the cron
  entry that drives the tick.

Two things it cannot provision, because they are accounts only you can hold: an
**S3-compatible bucket** for uploads, and a **mail provider's HTTPS API**. Have
both to hand before you start; the board boots without mail and delivers
nothing, silently.

## What to type into the deploy form

**Two secrets**, generated rather than chosen. Thirty-two characters is a floor
the board enforces at boot, not a suggestion:

\`\`\`sh
openssl rand -hex 32   # AUTH_SECRET
openssl rand -hex 32   # CRON_SECRET
\`\`\`

\`CRON_SECRET\` is the name Vercel Cron sends, as \`Authorization: Bearer\`, and it
cannot be told to send another. Note that this floor is stricter than the 16
characters Vercel's own cron documentation suggests — a value generated by
following those instructions is refused here, and the fix is a longer secret.

**Five driver values**, fixed. This is the one combination that works on
functions, for the reasons \`.env.example\` gives beside each of them:

\`\`\`ini
${VERCEL_FIXED_DRIVERS.join('\n')}
\`\`\`

**Two connection strings copied from the stores the button just created.**
\`DIRECT_DATABASE_URL\` takes Neon's \`DATABASE_URL_UNPOOLED\` — migrations and the
first-run installer each hold a session-level advisory lock, which a
transaction-mode pooler cannot hold. \`REDIS_URL\` takes whatever variable the
Upstash store published.

**Your bucket and your mail API**: \`S3_BUCKET\`, \`S3_REGION\`,
\`S3_ACCESS_KEY_ID\`, \`S3_SECRET_ACCESS_KEY\`, and \`MAIL_FROM\`,
\`MAIL_HTTP_ENDPOINT\`, \`MAIL_HTTP_TOKEN\`. Add \`S3_ENDPOINT\` for a bucket that is
not AWS (set \`S3_REGION=auto\` for R2), and \`S3_PUBLIC_BASE_URL\` when objects
are served from somewhere other than the API endpoint.

## First run: \`/install\`

The build applies migrations, but an empty schema is not yet a board. Open
\`https://<your-deployment>/install\` once the first deploy is green. It asks for
the board's name and address and for the first administrator's username, email
and password, creates the board and that account, and then **seals itself**:
\`/install\` answers 404 from then on. Run it against the database you intend to
keep — the screens are the ones
[docs/quickstart.md](${repositoryUrl}/blob/main/docs/quickstart.md#4-run-the-installer)
walks through.

## The tick

\`vercel.json\` asks Vercel to call \`${TICK_PATH}\` on \`${TICK_SCHEDULE}\`. That
route is how bans expire, digests send, mail leaves the outbox and the queue
drains; nothing here runs it on its own, because there is no worker process on
a function platform. Two things about it are worth knowing **before** you
deploy rather than after:

- **A per-minute schedule needs a paid plan.** Hobby allows a couple of cron
  jobs and runs each of them roughly once a day, at an hour Vercel chooses;
  only paid plans accept an arbitrary cron expression. A board ticking daily
  still loses nothing — tasks are written so a missed run delays work rather
  than dropping it — but "as it happens" notifications become a daily digest in
  all but name. To keep a minute-by-minute tick on Hobby, drive
  \`${TICK_PATH}\` from something else that can call a URL on a schedule — a
  GitHub Actions workflow, a systemd timer, an uptime pinger — presenting
  \`TICK_SECRET\` instead.
- **\`maxDuration = 300\` is validated when the project builds, not when the
  function runs.** A plan that does not allow 300 seconds therefore **fails the
  deployment** rather than clamping the request. With Fluid Compute — the
  default for new projects — Hobby allows 300 and this builds as written. With
  Fluid Compute switched off, Hobby caps a function at 60 seconds and the build
  fails. Turn Fluid Compute back on.

A tick that reaches the tasks and runs them answers \`200\` even when one of them
threw, with \`ok: false\` and the failure named in \`ran\`. That is deliberate:
schedulers retry non-2xx answers, and a task that fails every time would turn
each retry into another attempt against whatever it is failing against.

## Upgrading

\`\`\`sh
npm install --save-exact @meith/web@latest @meith/cli@latest @meith/theme-default@latest
npm install --save-exact next@$(node -p "require('./node_modules/@meith/web/package.json').dependencies.next")
git commit -am "Upgrade Meith and the Next.js version it builds with"
git push
\`\`\`

Vercel rebuilds on the push, and the build command applies the new migrations
before it builds. \`--save-exact\` matters and \`.npmrc\` already sets it for
everything else installed here.

The second command is not optional. This board pins \`next\` itself — Vercel
reads that pin to pick its Next.js builder — and nothing bumps it for you.
Upgrading only the \`@meith/*\` packages leaves two versions of Next
installed, the board built with one and the platform configured for the
other. Reading the version out of the freshly installed \`@meith/web\` keeps
them the same without anybody having to know the number.

Migrations are forward-only. Recovery is by restore, so take a backup first —
there is no down migration to undo a destructive one.

## Somewhere other than Vercel

Everything above is one deployment shape.
[docs/self-hosting.md](${repositoryUrl}/blob/main/docs/self-hosting.md) is the
same board as containers you run yourself, and \`npx create-meith <name>\`
scaffolds that shape instead — a Dockerfile, a compose file and a workflow that
builds the image. [docs/scaling.md](${repositoryUrl}/blob/main/docs/scaling.md)
explains why the five drivers above are what they are.
`
}

export function nextSteps(name: string): readonly string[] {
  return [`cd ${name}`, 'npm install', 'cp .env.example .env.local', 'npm run dev']
}
