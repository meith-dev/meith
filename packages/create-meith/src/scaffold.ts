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

export const VERCEL_BUILD_COMMAND = `meith migrate && forum-web build ${AT_ROOT_FLAG}`

export const TICK_PATH = '/api/system/tick'

export const TICK_SCHEDULE = '0 3 * * *'

export const RESEND_SENDER_MAILBOX = 'noreply'

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
# beside the framework's and is tracked normally.
#
# app/ and src/ are ignored WHOLESALE, and that has a consequence worth
# knowing before you go looking for it: a file you add under either is left
# alone by the build and still never committed, so it works locally and is
# simply absent from the deploy, which builds from what git has. Extend the
# board with a plugin or a theme instead — the forum loads those from
# meith.config.ts, and they are yours to commit. forum-web prints a
# warning naming any file of yours it finds there.
#
# For the rest, a build refuses rather than overwriting a file it did not
# write, and names it. The two exceptions are tsconfig.json and
# next-env.d.ts: forum-web generates those from scratch every run rather than
# copying them, so it cannot tell one of yours from a stale one of its own
# and replaces them without asking.
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
# \`meith migrate\` and \`meith backup\`. Migrations hold a session-level
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

const ENV_DATA_SOURCE_PROSE = `# Derived, and left commented out on purpose: with no DATABASE_URL the board
# serves \`fixture\` — deterministic in-memory sample data, no database needed,
# which is what \`npm run build\` uses and what \`npm run dev\` falls back to — and
# with one it serves \`postgres\`. Setting it to postgres while DATABASE_URL is
# still blank is refused at boot, so uncomment it only to override the
# derivation.`

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
# DATA_SOURCE=postgres

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
#
# The deploy form asks for none of them. On Vercel the board works each one out
# from what the linked stores publish: a DATABASE_URL means postgres for the
# data source and the queue, a Redis connection string means CACHE_DRIVER=redis,
# a Blob store's read-write token means FILESTORE_DRIVER=blob, and a
# RESEND_API_KEY with a MAIL_FROM beside it means mail over the provider's HTTPS
# API. Setting one here overrides the derivation, which is what this file is for
# when you copy it to .env.local.
#
# Every one of those derivations is scoped to Vercel, and each fires only from a
# value that is unambiguously the thing itself — a redis:// or rediss:// URL, a
# read-write token. A board you run anywhere else is untouched by all of it and
# still takes these values from this file, exactly as it did before.
#
# A derivation that cannot resolve is a configuration error, not an invitation
# to pick something safe-looking. On Vercel, with the cache or the object store
# missing, the board refuses to boot and names every variable it looked at. It
# will not quietly cache inside the instance, and it will not quietly write
# uploads to a disk that is about to disappear.
DATA_SOURCE=postgres
QUEUE_DRIVER=postgres
CACHE_DRIVER=redis
FILESTORE_DRIVER=blob
MAIL_DRIVER=http

${ENV_REQUIRED_HEADING}

${ENV_DATABASE_URL_PROSE}
DATABASE_URL=

${ENV_DIRECT_DATABASE_URL_PROSE}
#
# On Vercel this is not optional, and it is no longer yours to copy. DATABASE_URL
# here is the pooler string, the build runs \`meith migrate\` against it, and
# /install takes the second of those two session locks on first run. Left blank,
# the board reads Neon's own direct string — \`DATABASE_URL_UNPOOLED\` first, then
# \`POSTGRES_URL_NON_POOLING\` — and refuses to boot if neither is there, naming
# both. Never \`POSTGRES_URL\`: that one is pooled.
DIRECT_DATABASE_URL=

# The shared cache — a Redis or Valkey endpoint, \`rediss://\` for TLS. Redis
# holds cache entries and nothing else: losing it costs the board a warm cache,
# not data, and signs nobody out. Left blank on Vercel, the board reads the
# Upstash store's own \`KV_URL\`, which is the one variable it publishes that
# speaks the Redis protocol — \`KV_REST_API_URL\` is an HTTPS endpoint and is
# never used for this. A name we do not know goes here by hand.
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

# Uploads, in the Vercel Blob store the Deploy Button provisions. A store
# attached to the project publishes BLOB_STORE_ID and nothing else — no token —
# because the SDK authenticates with the deployment's own OIDC identity: the
# board hands it the store id and lets it fetch the credential. There is nothing
# to type and nothing to mistype, and FILESTORE_DRIVER=blob derives from this
# variable being present.
#
# BLOB_READ_WRITE_TOKEN is the other way in, and you make it yourself on the
# store. Set it when something has to reach the store from OUTSIDE a Vercel
# deployment — \`meith backup\` run on your own machine is the case that
# matters — because there is no OIDC identity there to borrow. Set both and the
# board prefers the store id, unless the token names a different store, in which
# case the token wins: naming another store is a deliberate act.
#
# Every object is written with private access: an object URL is not a public
# link, and member content is served by the board, which is where permissions
# are checked. An upload is held whole in the instance's memory on the way in
# and on the way out, so the function's memory limit, not the store, is what
# caps a file.
BLOB_STORE_ID=
BLOB_READ_WRITE_TOKEN=

# Uploads in an S3-compatible bucket instead — AWS, R2, MinIO, Spaces. This is
# the portable option, and the one every other deployment of this board uses:
# a bucket is a thing you hold, and it is not the only way to get the objects
# out of it. Set FILESTORE_DRIVER=s3 above and the first four below; boot fails
# naming any that are missing. S3_ENDPOINT is for anything that is not AWS and
# switches the client to path-style addressing; set S3_REGION=auto for R2.
# S3_PUBLIC_BASE_URL is the host objects are *served* from when that is not the
# API endpoint.
# S3_BUCKET=
# S3_REGION=
# S3_ACCESS_KEY_ID=
# S3_SECRET_ACCESS_KEY=
# S3_ENDPOINT=
# S3_PUBLIC_BASE_URL=

# Mail over the provider's own HTTPS API, on 443 — the one outbound path a
# function can rely on. SMTP on port 25 is blocked by serverless egress and the
# board refuses it on Vercel; 587 with STARTTLS may work, but an API does not
# depend on the platform's egress rules staying as they are.
#
# MAIL_FROM is optional where a provider publishes the domain it sends from:
# with RESEND_API_KEY and RESEND_EMAIL_DOMAIN both set, the board sends from
# noreply@ that domain and this can stay empty. Set it to send from another
# address — it must be at a domain the provider has verified for you, and an
# address set here always wins over the derived one.
MAIL_FROM=

# Add the Resend integration to the project from Vercel's marketplace and it
# publishes its key and its sending domain under these names, which the board
# reads: with RESEND_API_KEY set, and either RESEND_EMAIL_DOMAIN or a MAIL_FROM
# beside it, the board sends over Resend's HTTPS API and
# needs neither of the two variables below. The mail driver itself is a plain
# JSON-over-HTTPS sender and is not Resend-specific — this is one injected name
# bridged to the generic pair, not a provider baked into the board.
RESEND_API_KEY=

# Any other provider with the same shape — a bearer token and an endpoint that
# accepts {from, to, subject, text, html, reply_to}. Set BOTH, plus
# MAIL_DRIVER=http above; they do not turn the driver on by themselves, and only
# RESEND_API_KEY implies it.
#
# Setting just one of them stands the Resend bridge down completely, on purpose:
# the board will not hand a key issued for Resend to an endpoint you chose, nor
# aim your token at Resend. Boot fails naming the half you left out. Delete
# RESEND_API_KEY once you have moved off Resend.
# MAIL_HTTP_ENDPOINT=
# MAIL_HTTP_TOKEN=

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
  '.github/dependabot.yml',
  '.github/workflows/build.yml',
  'Dockerfile',
  'Dockerfile.prebuilt',
  'docker-compose.yaml',
  'docker-compose.prebuilt.yaml',
  'docker-entrypoint.sh',
  'docker-healthcheck.sh',
] as const

const VERCEL_DERIVED_DRIVERS = [
  'DATA_SOURCE=postgres',
  'QUEUE_DRIVER=postgres',
  'CACHE_DRIVER=redis',
  'FILESTORE_DRIVER=blob',
  'MAIL_DRIVER=http',
] as const

export const VERCEL_PROMPTED_ENV = ['AUTH_SECRET', 'CRON_SECRET'] as const

export const VERCEL_MARKETPLACE_PRODUCTS = [
  { type: 'integration', integrationSlug: 'neon', productSlug: 'neon', protocol: 'storage' },
  {
    type: 'integration',
    integrationSlug: 'upstash',
    productSlug: 'upstash-kv',
    protocol: 'storage',
  },
  { type: 'blob' },
  {
    type: 'integration',
    integrationSlug: 'resend',
    productSlug: 'resend-email',
    protocol: 'messaging',
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
      'Two secrets, generated rather than chosen — 32 characters or more each. Everything else the board reads from the database, cache, blob store and mail provider this form links.',
    ],
    ['envLink', `${templateRepositoryUrl}/blob/main/.env.example`],
    ['products', JSON.stringify(VERCEL_MARKETPLACE_PRODUCTS)],
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
          meith: 'meith',
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
    'meith.config.ts',
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
 * plugin is the same, through board.plugins.json and meith.plugins.ts —
 * see docs/customization/plugins.md.
 */
import { defineForumConfig } from '@meith/web/config'
import {
  BROWSER_THEME_COLOR,
  DARK_TOKENS,
  defaultMessages,
  defaultTheme,
  LIGHT_TOKENS,
} from '@meith/theme-default'

import { INSTALLED_PLUGINS } from './meith.plugins'

export default defineForumConfig({
  themes: {
    default: {
      key: 'default',
      title: 'Default',
      tokens: { light: LIGHT_TOKENS, dark: DARK_TOKENS },
      browserThemeColor: BROWSER_THEME_COLOR,
      theme: defaultTheme,
      messages: defaultMessages,
    },
  },
  defaultTheme: 'default',

  plugins: INSTALLED_PLUGINS,
})
`,
  )

  files.set('board.plugins.json', `${JSON.stringify({ plugins: [] }, null, 2)}\n`)

  files.set(
    'meith.plugins.ts',
    `/**
 * The board's installed-plugin list.
 *
 * Inside the Meith monorepo this file is generated from board.plugins.json
 * by \`pnpm board:gen\` (see docs/customization/plugins.md) — that generator is
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
 * \`meith plugin:add\`/\`plugin:remove\` read inside the monorepo — kept
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
    '.github/dependabot.yml',
    `# Keeps this board's GitHub Actions current: one weekly pull request that
# bumps the actions pinned in .github/workflows. Upgrading Meith itself is
# separate and deliberate — see README.md, "Upgrading" — because the board's
# \`next\` pin has to move together with \`@meith/web\` rather than on its own.
version: 2
updates:
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
    groups:
      actions:
        patterns: ['*']
`,
  )

  files.set(
    'Dockerfile',
    `# syntax=docker/dockerfile:1.7-labs
# check=skip=InvalidDefaultArgInFrom
# ${name}'s quick-start deploy image — built from source, with nothing to
# set up first.
#
# FROM node:26-alpine directly rather than a published Meith base image:
# Coolify (or a plain \`docker build\`) builds this from this repository, so
# there is no registry account, no image tag to paste anywhere, and no
# \`.github/workflows/build.yml\` run to wait on. The cost of that zero setup
# is that this installs the board's full dependency closure itself (see the
# \`npm install\` below), so a build here is heavier than \`Dockerfile.prebuilt\`'s
# thin delta — that image, pulled rather than built, is the trade the advanced
# path takes for a low-spec build server or a faster deploy (see \`README.md\`
# and, in the meith repository, docs/getting-started/deployment/docker-compose.md,
# "Custom boards").
#
# Two stages, not three: unlike the official image, this does not prune down
# to Next's own standalone output. The migrate role below runs \`meith
# migrate\`, and \`meith\` materializes @meith/cli's sources and runs them
# with tsx at the moment it runs (see the meith repository's
# docs/contributing/development.md, "Consuming the board from a workspace") — it needs
# the full, un-pruned node_modules tree this board installed, not what Next
# traced as reachable from the web server alone. The tick itself is driven
# by docker-compose.yaml's own \`worker\` service — a lightweight loop against
# /api/system/tick, not a compiled worker process, because @meith/worker is
# not published (see the meith repository's docs/contributing/release.md).
FROM node:26-alpine@sha256:aadf416b2cdce311a8811ba3f0608a61b77dbf997500e2eafe781b51f6a0b019 AS deps
WORKDIR /board

# This board's own manifest, cached independently of its source — editing
# meith.config.ts should not re-run npm install. Nothing warms node_modules
# ahead of this the way \`Dockerfile.prebuilt\`'s base image does: the full
# @meith/web, @meith/cli and @meith/theme-default closure this board depends
# on is installed here, from scratch, which is the heavier half of the
# quick-start trade.
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
# the meith repository's docs/contributing/development.md, "Fixture mode"), but baking
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
    'Dockerfile.prebuilt',
    `# syntax=docker/dockerfile:1.7-labs
# check=skip=InvalidDefaultArgInFrom
# ${name}'s advanced deploy image — built by \`.github/workflows/build.yml\` and
# pulled by \`docker-compose.prebuilt.yaml\`. A quick-start board never builds
# this file directly; it can delete this file, \`docker-compose.prebuilt.yaml\`
# and \`.github/workflows/build.yml\` outright and keep only \`Dockerfile\` and
# \`docker-compose.yaml\` (see README.md, "Deploy").
#
# FROM the published framework base image — deps + framework layers only,
# locked to this exact release (see the meith repository's
# docs/getting-started/deployment/docker-compose.md, "Custom boards", and docker/Dockerfile.base for what
# it is and is not). This board's own Dockerfile only ever installs its own
# delta on top of it — a new plugin's own dependency, typically nothing more
# — which is what keeps a rebuild after \`npm install some-plugin\` a matter
# of minutes rather than a cold toolchain build.
#
# Two stages, not three: unlike the official image, this does not prune down
# to Next's own standalone output. The migrate role below runs \`meith
# migrate\`, and \`meith\` materializes @meith/cli's sources and runs them
# with tsx at the moment it runs (see the meith repository's
# docs/contributing/development.md, "Consuming the board from a workspace") — it needs
# the full, un-pruned node_modules tree this board installed, not what Next
# traced as reachable from the web server alone. The tick itself is driven
# by docker-compose.yaml's own \`worker\` service — a lightweight loop against
# /api/system/tick, not a compiled worker process, because @meith/worker is
# not published (see the meith repository's docs/contributing/release.md).
ARG MEITH_VERSION
FROM ghcr.io/meith-dev/meith-base:\${MEITH_VERSION} AS deps
WORKDIR /board

# This board's own manifest, cached independently of its source — editing
# meith.config.ts should not re-run npm install. The base image above
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
# the meith repository's docs/contributing/development.md, "Fixture mode"), but baking
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
# published, so nothing here can run it — docker-compose.yaml's own \`worker\`
# service drives the tick a different way, calling this image's web role
# over HTTP instead of running as a role of this image.
set -e

# An explicit command wins over the role, the same as the official image —
# \`docker run <image> node_modules/.bin/meith --help\` should still run
# the CLI rather than silently starting the web server.
if [ "$#" -gt 0 ]; then
  exec "$@"
fi

case "\${MEITH_ROLE:-web}" in
  migrate)
    # Runs to completion and exits; compose's one-shot service waits on it.
    exec node_modules/.bin/meith migrate
    ;;
  web)
    exec node_modules/.bin/forum-web start
    ;;
  *)
    echo "Unknown MEITH_ROLE: \${MEITH_ROLE}. Expected 'web' or 'migrate'." >&2
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

if [ "\${MEITH_ROLE:-web}" = "migrate" ]; then
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
    `# The advanced/prebuilt path (see README.md, "Deploy"). Builds this board's
# Dockerfile.prebuilt and pushes it to your own GHCR, on every push to main.
# No secret to configure: GITHUB_TOKEN is provided automatically by GitHub
# Actions and is enough to push to ghcr.io/<this repository>.
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
          docker build -f Dockerfile.prebuilt --build-arg MEITH_VERSION="$MEITH_VERSION" -t "$IMAGE:\${{ github.sha }}" -t "$IMAGE:latest" .
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
            echo "Either of these goes in the MEITH_IMAGE variable on the Coolify"
            echo "resource:"
            echo
            echo "    $IMAGE:\${{ github.sha }}"
            echo
            echo "    $IMAGE:latest"
            echo
            echo "The first names this run's build and nothing else, ever: nothing"
            echo "moves under you, and an upgrade is you editing this variable."
            echo
            echo "The second follows main — every push rebuilds it and Coolify's next"
            echo "Redeploy picks that build up, a commit still mid-feature included."
            echo "That is the trade the quickstart takes while a board is young and"
            echo "still gaining plugins: installing one is a push and a Redeploy, with"
            echo "nothing on the resource to edit."
            echo
            echo "## One-time: check the package is public"
            echo
            echo "Coolify can only pull a public package, and this one may already be"
            echo "one — a build from a public repository usually lands public. Open"
            echo "$PKG_URL: if it does not already say Public, change it there —"
            echo "**Package settings** → **Change visibility** → **Public**."
          } >> "$GITHUB_STEP_SUMMARY"
`,
  )

  files.set(
    'docker-compose.yaml',
    `# ${name}, quick-start deployed by Coolify — the same shape as the meith
# repository's own docker/compose.coolify.yml: db, migrate, web, worker. See
# README.md for the deploy story this file is the last step of.
#
# Coolify builds \`Dockerfile\` from this repository itself, so there is no
# MEITH_IMAGE to set here — every deploy is a build from source. For a
# low-spec build server or a faster deploy, use \`docker-compose.prebuilt.yaml\`
# instead, which pulls the image \`.github/workflows/build.yml\` pushes to GHCR.
#
# No published ports — Coolify's proxy routes to the container and issues
# the certificate. The two secrets and the database password are Coolify's
# own "magic variables": it fills them in on the first deploy and shows them
# in the panel, so nothing here needs a value typed into it. Requires Coolify
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
    build: .
    image: ${name}
    environment:
      MEITH_ROLE: migrate
      DATABASE_URL: postgres://community:$SERVICE_PASSWORD_POSTGRES@postgres:5432/community
      AUTH_SECRET: $SERVICE_BASE64_64_AUTH
      TICK_SECRET: $SERVICE_BASE64_64_TICK
    depends_on:
      postgres:
        condition: service_healthy
    restart: 'no'

  web:
    build: .
    image: ${name}
    restart: unless-stopped
    mem_limit: \${WEB_MEM_LIMIT:-1g}
    cpus: \${WEB_CPUS:-2}
    # A readiness probe Coolify gates a rolling deploy on: with "Rolling
    # update" enabled on the resource, the new container must answer
    # /api/ready before the old one is retired, so a redeploy swaps in with no
    # gap. Without it Coolify recreates the stack — old removed, then new
    # started — and the board is down while the new web boots.
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3000/api/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      start_period: 20s
      retries: 3
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
  # docs/contributing/release.md), so there is no compiled worker binary a scaffolded
  # board can run — this drives the tick the alternative way the meith
  # repository documents in docs/getting-started/deployment/docker-compose.md, "Running the tick without
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
    'docker-compose.prebuilt.yaml',
    `# ${name}, deployed by Coolify from a prebuilt image — the advanced path: point
# Coolify's compose-file at this file instead of docker-compose.yaml once
# \`.github/workflows/build.yml\` has pushed an image, and set MEITH_IMAGE to
# what its Summary printed. This trades the quick-start's heavier
# build-on-every-deploy for a low-spec build server or a faster deploy — see
# README.md, "Deploy".
#
# Same shape as the meith repository's own docker/compose.coolify.yml: db,
# migrate, web, worker.
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
    # Pull the tag on every deploy. Compose keeps an image it already has, so
    # a rebuilt \`:latest\` is otherwise never fetched and a redeploy quietly
    # runs the old code.
    pull_policy: always
    environment:
      MEITH_ROLE: migrate
      DATABASE_URL: postgres://community:$SERVICE_PASSWORD_POSTGRES@postgres:5432/community
      AUTH_SECRET: $SERVICE_BASE64_64_AUTH
      TICK_SECRET: $SERVICE_BASE64_64_TICK
    depends_on:
      postgres:
        condition: service_healthy
    restart: 'no'

  web:
    image: \${MEITH_IMAGE:?set this to the image the build workflow's Summary just printed, e.g. ghcr.io/<you>/${name}:latest}
    pull_policy: always
    restart: unless-stopped
    mem_limit: \${WEB_MEM_LIMIT:-1g}
    cpus: \${WEB_CPUS:-2}
    # A readiness probe Coolify gates a rolling deploy on: with "Rolling
    # update" enabled on the resource, the new container must answer
    # /api/ready before the old one is retired, so a redeploy swaps in with no
    # gap. Without it Coolify recreates the stack — old removed, then new
    # started — and the board is down while the new web boots.
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3000/api/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      start_period: 20s
      retries: 3
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
  # docs/contributing/release.md), so there is no compiled worker binary a scaffolded
  # board can run — this drives the tick the alternative way the meith
  # repository documents in docs/getting-started/deployment/docker-compose.md, "Running the tick without
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

Two paths onto [Coolify](https://coolify.io), both ending at the same
\`/install\`. **Quick start** is the default and needs nothing but a push;
**advanced/prebuilt** moves the build off the server, onto GitHub Actions, for
a low-spec build server or a faster deploy. Pick one — a board only ever runs
one of them at a time.

### Quick start (default)

Coolify builds the image itself, from this repository, every time it
deploys — there is nothing to push anywhere first and no image tag to paste
in. Two steps:

1. **Push this repository to GitHub.**

2. **Point Coolify at \`docker-compose.yaml\`** — a **Public Git repository**
   resource with **Docker Compose** as its build pack, this repository as its
   source. The name is Coolify's own default, so its **Compose file** field is
   already right when the form opens, and the file already carries Coolify's
   own "magic variables" for \`AUTH_SECRET\`, \`TICK_SECRET\` and the database
   password, generated on the first deploy and never typed in. Nothing else to
   set: \`docker-compose.yaml\` builds \`web\` and \`migrate\` from \`Dockerfile\`
   itself, so there is no \`MEITH_IMAGE\` here at all.

3. **Deploy, then \`/install\` on your own domain.** Coolify issues the
   certificate; the installer from there is the one
   [docs/getting-started/deployment/coolify.md](${repositoryUrl}/blob/main/docs/getting-started/deployment/coolify.md#4-run-the-installer)
   walks through, screen for screen. It seals itself when it finishes, and
   \`/install\` answers 404 from then on — run it **against the database you
   are going to keep**. Every push to \`main\` after this is picked up the next
   time Coolify's own **Redeploy** button runs — pushing alone does not
   rebuild it.

The trade for that zero setup is a heavier build: \`Dockerfile\` installs this
board's full dependency closure on the server itself, on every deploy, rather
than starting from a warm base image. A 2 GB VPS can OOM on it. If that is
your server, use the advanced path below instead.

A quick-start board never needs \`Dockerfile.prebuilt\`,
\`docker-compose.prebuilt.yaml\` or \`.github/workflows/build.yml\` — delete all
three.

### Advanced / prebuilt — for a low-spec server or a faster deploy

Something else builds the image ahead of time; the server only ever pulls
one. Three steps, nothing to configure by hand beyond one value only you know:

1. **Push this repository to GitHub.** \`.github/workflows/build.yml\` builds
   \`Dockerfile.prebuilt\` on every push to \`main\` and pushes the result to your
   own GitHub Container Registry, \`ghcr.io/<you>/${name}\` — using only the
   \`GITHUB_TOKEN\` every GitHub Actions run already carries. No secret to
   add, no registry account beyond the GitHub account you already have.

   That build is the thing step 2 waits on: open the repository's
   **Actions** tab and let the run finish, because its **Summary** is where
   the exact image to paste into step 2 comes from. The Summary also links
   the package itself, to check it is public — a build from a public
   repository usually lands public already, and a private one fails
   Coolify's pull with an authentication error no operator can act on.

2. **Point Coolify at \`docker-compose.prebuilt.yaml\`** — a
   **Public Git repository** resource with **Docker Compose** as its build
   pack, this repository as its source, and its **Compose file** field
   changed from Coolify's default of \`docker-compose.yaml\` to
   \`docker-compose.prebuilt.yaml\`. That file carries Coolify's own "magic
   variables" for \`AUTH_SECRET\`, \`TICK_SECRET\` and the database password,
   generated on the first deploy and never typed in. The one thing Coolify
   cannot generate is the image step 1 just pushed: set \`MEITH_IMAGE\` in the
   resource's own environment to one of the two values that run's Summary
   printed (\`docker-compose.prebuilt.yaml\` refuses to start without it, with
   a message saying why). \`ghcr.io/<you>/${name}:\${{ github.sha }}\` names
   that one build and nothing else, ever; \`ghcr.io/<you>/${name}:latest\`
   follows \`main\` instead, so installing a plugin later is a push and a
   **Redeploy** — the trade this path takes, at the cost of an unrelated
   redeploy pulling whatever \`main\` most recently built.

3. **Deploy, then \`/install\` on your own domain.** Same installer, same
   [docs/getting-started/deployment/coolify.md](${repositoryUrl}/blob/main/docs/getting-started/deployment/coolify.md#4-run-the-installer)
   walk-through, same one-time seal. Every push to \`main\` after this rebuilds
   the image; Coolify's own **Redeploy** button is what actually pulls it —
   pushing alone does not.

No Docker Hub, no paid CI: GitHub Actions' free tier and GHCR are the whole
build side of this, for a board of any size.

**Building it yourself**: works on any machine with Docker, if you would
rather not use GitHub Actions for the build — push the result wherever
\`docker-compose.prebuilt.yaml\`'s \`MEITH_IMAGE\` can reach.

\`\`\`sh
docker build -f Dockerfile.prebuilt --build-arg MEITH_VERSION=$(node -p "require('./package.json').dependencies['@meith/web']") -t ${name} .
\`\`\`

**Without a panel**: [docs/getting-started/deployment/docker-compose.md](${repositoryUrl}/blob/main/docs/getting-started/deployment/docker-compose.md)
is the same four containers by hand — your own \`.env\`, a reverse proxy you
already run, no Coolify. \`Dockerfile\` and \`docker-compose.yaml\` here are this
board's own version of exactly that shape (or \`Dockerfile.prebuilt\` and
\`docker-compose.prebuilt.yaml\`, for the advanced path).

Two things nothing configures for you, on either path:

- **Mail.** Until \`MAIL_DRIVER\` and its three settings exist, every message is
  written to the log and delivered to nobody, so password reset fails silently.
- **The tick.** The compose file's \`worker\` service drives it here — a small
  loop calling \`/api/system/tick\` once a minute, since \`@meith/web\`'s own
  worker package is not something a board outside the meith monorepo can
  depend on yet. Deploy some other way and something still has to call that
  route (or run \`meith task:run\`) every minute, or nothing catches up
  and nothing errors.

## Local

\`\`\`sh
npm install
npm run dev
\`\`\`

No environment file, no database: with no \`DATABASE_URL\` the board serves
deterministic in-memory sample data, which is enough to click through every
reading surface.

Posting needs Postgres. Copy \`.env.example\` to \`.env.local\`, set
\`DATABASE_URL\` and the two secrets in it, then:

\`\`\`sh
npm run meith -- migrate
echo "<password>" | npm run meith -- user:create --username <name> --email <address> --group administrators
\`\`\`

## Configuring

- **\`meith.config.ts\`** — installed themes and plugins. Everything installable
  is named here so the bundler can see it; nothing is found by scanning a
  directory at runtime.
- **\`/admin\`** — settings, forums, groups, members, themes, maintenance. An
  administrator re-enters their password to get in, and again for anything
  destructive.
- **\`npm run meith -- --help\`** — the operator CLI. Everything the panel does
  and a few things it cannot, without a browser.

## Installing plugins and themes

Nothing installs into a running container — a plugin or theme has to be
built into the image, the same as any other dependency:

1. **In this repository**, install it:

   \`\`\`sh
   npm install --save-exact @meith/plugin-dues
   \`\`\`

   (a theme is the same command with its own package, e.g.
   \`@meith/theme-midnight\`).

2. **Register it.** A **theme** goes in \`meith.config.ts\`, in the \`themes\`
   map, following the shape of the \`default\` entry already there. A
   **plugin** goes in \`meith.plugins.ts\`: import its \`plugin\` and
   \`messages\` exports and add \`{ key, enabled: true, plugin, messages }\`
   to \`INSTALLED_PLUGINS\` — or run

   \`\`\`sh
   npm run meith -- plugin:add @meith/plugin-dues
   \`\`\`

   which edits \`board.plugins.json\` and regenerates \`meith.plugins.ts\`
   for you.

3. **Commit and push**, then **Redeploy** from Coolify — pushing alone does
   not rebuild. Quick start builds the new image on that redeploy; advanced/prebuilt
   waits for \`.github/workflows/build.yml\` to finish first, and Redeploy is
   what actually pulls the result.

4. **Once it is up, run its migrations one time:**

   \`\`\`sh
   docker compose run --rm web meith upgrade
   \`\`\`

See [docs/customization/plugins.md](${repositoryUrl}/blob/main/docs/customization/plugins.md)
and [docs/customization/themes.md](${repositoryUrl}/blob/main/docs/customization/themes.md)
for the full reference.

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

This upgrade is deliberate and manual for that reason: \`next\` and
\`@meith/web\` move together or not at all. What *is* kept current for you is
this repository's own GitHub Actions — \`.github/dependabot.yml\` opens a
weekly pull request bumping the actions pinned in
\`.github/workflows/build.yml\`, which is a safe, independent update the two
commands above never touch.

On the quick-start path there is no version to keep in sync by hand:
\`Dockerfile\` runs \`npm install\` straight from this \`package.json\` on every
build, so a rebuild always picks up whatever is pinned there. On the
advanced/prebuilt path, that \`package.json\` change is the whole pin:
\`Dockerfile.prebuilt\`'s own \`FROM\` line takes the version as a build argument,
and \`.github/workflows/build.yml\` reads it straight out of \`package.json\`'s
own \`@meith/web\` dependency when it rebuilds — nothing in
\`Dockerfile.prebuilt\` itself to keep in sync by hand. \`--save-exact\` matters
either way: npm's default \`save-prefix\` is \`^\`, and a caret range is not a
legal Docker image tag for the advanced path — without it, this exact command
would write \`"^0.18.0"\` and the next \`Dockerfile.prebuilt\` build would fail
with \`invalid reference format\` instead of building. This
project's own \`.npmrc\` sets \`save-exact=true\` for the same reason, so an
\`npm install\` of anything else here — a plugin, say — stays pinned too; the
build workflow also refuses to build from anything but an exact version, as
a second line of defense. Once the rebuilt image is deployed, run
\`npm run meith -- upgrade\` against it for the plugin migrations — see
[the operator CLI](${repositoryUrl}/blob/main/docs/guides/operations/operating.md#the-operator-cli)
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
- **An Upstash Redis store**, attached the same way, for the shared cache. It
  publishes \`KV_URL\`, which the board reads as \`REDIS_URL\` — \`KV_REST_API_URL\`
  beside it is an HTTPS endpoint and is not used for this.
- **A Vercel Blob store** for uploads, which publishes \`BLOB_STORE_ID\` into the
  project by itself. That is the whole credential: the board hands the id to
  Vercel's SDK, which authenticates with the deployment's own OIDC identity, so
  there is no token to copy. This is what used to be four hand-typed \`S3_*\`
  secrets.
- **A Resend mail account**, attached the same way, which publishes
  \`RESEND_API_KEY\` and \`RESEND_EMAIL_DOMAIN\`. The board reads both names
  directly: its mail driver already speaks Resend's request shape, so there is
  nothing to adapt, and the sending domain is what the sender is built from.
- **A Vercel project** carrying \`vercel.json\` — the build command
  \`${VERCEL_BUILD_COMMAND}\`,
  which applies the schema before it builds, materializes the board's app at
  the project root so the artefact lands where Vercel reads it, and the cron
  entry that drives the tick.

**Mail needs no variables after the deploy.** Resend publishes both its key
and its sending domain, and the board sends from \`${RESEND_SENDER_MAILBOX}@\`
that domain — see *Mail* below to send from a different address, and for the
one case that does need you: a domain Resend has not verified yet.

## What to type into the deploy form

**Two secrets**, generated rather than chosen. Thirty-two characters is a floor
the board enforces at boot, not a suggestion:

\`\`\`sh
openssl rand -hex 32   # AUTH_SECRET
openssl rand -hex 32   # CRON_SECRET
\`\`\`

\`CRON_SECRET\` is the name Vercel Cron sends, as \`Authorization: Bearer\`, and it
cannot be told to send another — the caller is the platform, so this one has to
be an environment variable both ends can read, and cannot be something the
board makes up for itself. Note that this floor is stricter than the 16
characters Vercel's own cron documentation suggests — a value generated by
following those instructions is refused here, and the fix is a longer secret.

\`AUTH_SECRET\` seals members' two-factor secrets and signs the unsubscribe links
in outgoing mail. It stays in the environment deliberately: a copy of the
database is then not enough to forge either.

**That is the whole form.** Everything else the board works out from the stores
this button just linked to the project:

\`\`\`ini
${VERCEL_DERIVED_DRIVERS.join('\n')}
\`\`\`

\`DIRECT_DATABASE_URL\` comes from Neon's own \`DATABASE_URL_UNPOOLED\`, or
\`POSTGRES_URL_NON_POOLING\` if that one is absent — migrations and the first-run
installer each hold a session-level advisory lock, which the pooled
\`DATABASE_URL\` cannot hold. \`REDIS_URL\` comes from Upstash's \`KV_URL\`, the one
variable it publishes that speaks the Redis protocol.

Every one of those derivations is scoped to this platform, fires only where you
have not set the variable yourself, and **refuses to boot rather than guess**.
If a store is missing, or publishes a name this board does not know, the deploy
stops with a message naming every variable it looked at — it will not fall back
to caching inside each instance, or to uploads on a disk that is discarded with
the instance. When the name is one we do not know, set \`REDIS_URL\` or
\`DIRECT_DATABASE_URL\` in the project's environment settings and the derivation
stands aside.

If you would rather keep uploads somewhere you hold yourself — see *Leaving
Vercel* below for why that matters — set \`FILESTORE_DRIVER=s3\` and add
\`S3_BUCKET\`, \`S3_REGION\`, \`S3_ACCESS_KEY_ID\` and \`S3_SECRET_ACCESS_KEY\` in the
project's environment settings, with \`S3_ENDPOINT\` for a bucket that is not AWS
(\`S3_REGION=auto\` for R2). The same board runs either way.

## Mail

**There is nothing to set.** The Resend the deploy form added publishes two
names into the project: \`RESEND_API_KEY\`, and \`RESEND_EMAIL_DOMAIN\` — the
domain it sends from. The board reads both, sends from
\`${RESEND_SENDER_MAILBOX}@\` that domain, and posts over Resend's HTTPS API.

**If Resend refuses the messages**, that domain is not verified yet. Resend
will not send from a domain it has not verified, whoever set the address, so
verify it from the Resend dashboard — the deploy cannot do that step for you,
because it is Resend confirming you own the domain. This is the one thing here
that can need attention, and it announces itself: the test button below says
so rather than the board failing quietly.

**To send from a different address**, set \`MAIL_FROM\` in the project's
environment settings and redeploy. It must be at a domain Resend has verified,
for the same reason. An address you set always wins over the derived one.

A board with the key but no verified domain — which is what you get if you
remove the integration's \`RESEND_EMAIL_DOMAIN\` without putting a
\`MAIL_FROM\` in its place — does not guess a sender. It stays on the log
driver and delivers nothing, which is the honest outcome: a guessed sender at
an unverified domain would be refused by Resend anyway, one message at a
time.

The board is not tied to Resend. Its mail driver is a plain JSON-over-HTTPS
sender that posts \`{from, to, subject, text, html, reply_to}\` with a bearer
token — Resend's \`POST /emails\` happens to be exactly that shape, which is why
it needs no adapter. Any provider with the same shape works: set
\`MAIL_HTTP_ENDPOINT\`, \`MAIL_HTTP_TOKEN\` and \`MAIL_DRIVER=http\` in the
project's environment settings, and set the first two **together** — either
one on its own stands the Resend bridge down, so a key issued for Resend is
never presented to an endpoint you chose. Setting \`MAIL_DRIVER\` to anything
but \`http\` stands the bridge down too, for the same reason: a board that
moved to SMTP must not send through its new provider from Resend's domain.
Delete \`RESEND_API_KEY\` once you have moved off Resend.

Check it worked: sign in as the administrator and use the test button on
**/admin → Settings → Mail**.

## First run: \`/install\`

The build applies migrations, but an empty schema is not yet a board. Open
\`https://<your-deployment>/install\` once the first deploy is green. It asks for
the board's name and address and for the first administrator's username, email
and password, creates the board and that account, and then **seals itself**:
\`/install\` answers 404 from then on. Run it against the database you intend to
keep — the screens are the ones
[docs/getting-started/deployment/docker-compose.md](${repositoryUrl}/blob/main/docs/getting-started/deployment/docker-compose.md#6-install-it)
walks through.

## The tick

\`vercel.json\` asks Vercel to call \`${TICK_PATH}\` on \`${TICK_SCHEDULE}\`. That
route is how bans expire, digests send, mail leaves the outbox and the queue
drains; nothing here runs it on its own, because there is no worker process on
a function platform. Two things about it are worth knowing **before** you
deploy rather than after:

- **This ships a daily schedule, because Hobby refuses anything faster.** A
  Hobby plan rejects a cron expression that would run more than once a day —
  the deployment fails outright rather than being slowed down — so
  \`vercel.json\` carries \`${TICK_SCHEDULE}\` and deploys anywhere. On a
  paid plan, edit it to \`* * * * *\` and the board ticks every minute.

  A daily tick loses nothing permanently: tasks are written so a missed run
  delays work rather than dropping it, and a password reset is sent as the
  request is handled rather than waiting for a tick. What it does delay is
  everything the tick drives — a new post is not findable in search, and a
  notification is not sent, until the next run.

  **To keep a fast tick without paying**, drive \`${TICK_PATH}\` from anything
  that can call a URL on a schedule — a GitHub Actions workflow, a systemd
  timer, an uptime pinger — presenting \`TICK_SECRET\` instead of
  \`CRON_SECRET\`. The endpoint accepts either, so the Vercel cron and an
  outside scheduler can both drive it.
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

## Leaving Vercel

A board must stay movable, and the Blob store is the one part of this shape that
is not portable: Neon and Upstash hand out ordinary Postgres and Redis strings
that any host accepts, but a Vercel Blob store is reachable only through Vercel's
own API and there is no bucket to sync out of it. **The uploads are the thing you
have to carry out deliberately, and \`meith backup\` is how.**

Under \`FILESTORE_DRIVER=blob\`, \`meith backup\` includes the uploads **by
default** — it walks the Blob store, pulls every object, and puts them in the
bundle beside the database dump. This is the opposite of the \`s3\` default, which
skips them, because a bucket has its own backup story you can drive yourself and
a Blob store does not:

\`\`\`sh
DATABASE_URL=…            # Neon's pooled string
DIRECT_DATABASE_URL=…     # Neon's DATABASE_URL_UNPOOLED
FILESTORE_DRIVER=blob
BLOB_READ_WRITE_TOKEN=…   # create one on the store; see below
npm run meith -- backup
\`\`\`

Run that from a checkout of this repository, with those four values in the
environment — the CLI talks to Neon and to the Blob store over the network, so
it does not have to run on Vercel.

That last one is the one value this route asks you to make by hand, and only
here. On the deployment the board reaches the store with \`BLOB_STORE_ID\` and
the deployment's OIDC identity, which a command on your own machine does not
have. Open the store under **Storage**, create a read-write token, and use it
for the backup; the board itself never needs it. The bundle it writes holds the dump *and*
every object. Check the last line it prints: if it says *no uploads*, the
uploads are not in the bundle and restoring it gives a board whose posts have
broken images.

Restoring puts them wherever the *restoring* board's \`FILESTORE_DRIVER\` points,
so the same bundle moves the board either onward or away:

\`\`\`sh
# onto a self-hosted board with a bucket
FILESTORE_DRIVER=s3 S3_BUCKET=… RESTORE_DATABASE_URL=… npm run meith -- restore bundle.tar.gz

# onto a board that keeps uploads on its own disk
RESTORE_DATABASE_URL=… npm run meith -- restore bundle.tar.gz --uploads-dir ./uploads
\`\`\`

Take one before you need it. A Blob store deleted with the Vercel project takes
the attachments with it, and there is no second copy anywhere unless you made
one.

## Somewhere other than Vercel

Everything above is one deployment shape.
[docs/getting-started/deployment/docker-compose.md](${repositoryUrl}/blob/main/docs/getting-started/deployment/docker-compose.md) is the
same board as containers you run yourself, and \`npx create-meith <name>\`
scaffolds that shape instead — a Dockerfile, a compose file and a workflow that
builds the image. [docs/guides/operations/scaling.md](${repositoryUrl}/blob/main/docs/guides/operations/scaling.md)
explains why the drivers above are what they are, and why an S3-compatible
bucket is the portable choice for uploads everywhere but here.
`
}

export function nextSteps(name: string): readonly string[] {
  return [`cd ${name}`, 'npm install', 'npm run dev']
}
