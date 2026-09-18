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

export const NEXT_VERSION = '16.3.4'

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

const ENV_BACKUP_BLOCK = `# The off-site backup destination: an S3-compatible bucket \`meith backup\`
# ships every bundle to, pruned there to the newest --keep (7 unless set).
# All four required together — a partial set fails the backup, never the board.
# BACKUP_S3_ENDPOINT is for anything S3-compatible (R2, MinIO, Spaces;
# BACKUP_S3_REGION=auto for R2); BACKUP_S3_PREFIX shares one bucket between
# boards. Use a bucket of its own, never the bucket the uploads live in.
# BACKUP_S3_BUCKET=
# BACKUP_S3_REGION=
# BACKUP_S3_ACCESS_KEY_ID=
# BACKUP_S3_SECRET_ACCESS_KEY=
# BACKUP_S3_ENDPOINT=
# BACKUP_S3_PREFIX=
#
# Or a WebDAV folder instead of a bucket — Nextcloud, ownCloud, a Hetzner
# Storage Box. The address of a folder that already exists; username and
# password together or not at all. One destination or the other, never both.
# BACKUP_WEBDAV_URL=
# BACKUP_WEBDAV_USERNAME=
# BACKUP_WEBDAV_PASSWORD=`

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

${ENV_BACKUP_BLOCK}

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
  '.github/workflows/build.yml',
  'Dockerfile',
  'Dockerfile.prebuilt',
  'docker-compose.yaml',
  'docker-compose.prebuilt.yaml',
  'docker-compose.byhand.yaml',
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
 * see docs/extensions/plugins.md.
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
    `// Generated from board.plugins.json by \`meith plugin:add\` and \`meith plugin:remove\`.
//
// The simple path is those commands, or editing board.plugins.json and running one of
// them. A plugin that does not fit that convention can be added here by hand instead —
// keep it out of board.plugins.json so a regenerate does not drop it.
//
// docs/extensions/plugins.md explains both.

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
# bumps the actions pinned in .github/workflows. Meith itself is updated
# separately, by .github/workflows/update.yml — see README.md, "Upgrading" —
# because the board's \`next\` pin has to move together with \`@meith/web\`
# rather than on its own.
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
    '.github/workflows/update.yml',
    `# Opens a pull request whenever a new Meith release is out — see README.md,
# "Upgrading". Once a week, and on the Run workflow button, it runs the same
# updater you can run by hand, \`npx create-meith@latest update\`: every
# @meith/* pin and next moved together in package.json, and the deploy files
# the scaffold owns rewritten to the new release's shape. A file you have
# edited yourself is never rewritten; the run's log names any it left alone.
#
# One-time setup: under Settings → Actions → General, enable "Allow GitHub
# Actions to create and approve pull requests" — without it the last step
# fails, saying GitHub Actions is not permitted to create pull requests.
#
# Merging is still an upgrade, not a formality: read the release notes the
# pull request links, take a backup first, and once the new version serves,
# run \`meith upgrade\` against it. Migrations are forward-only — the backup
# is the rollback.
name: Meith update

on:
  schedule:
    - cron: '30 4 * * 1'
  workflow_dispatch:

permissions:
  contents: write
  pull-requests: write

jobs:
  update:
    name: Update Meith
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7

      - name: Run the updater
        run: npx --yes create-meith@latest update

      - name: Open a pull request
        env:
          GH_TOKEN: \${{ github.token }}
        run: |
          if [ -z "$(git status --porcelain)" ]; then
            echo "Already up to date."
            exit 0
          fi
          VERSION=$(node -p "require('./package.json').dependencies['@meith/web']")
          BODY="$RUNNER_TEMP/meith-update-body.md"
          {
            echo "Updates this board to Meith $VERSION — every @meith/* package and"
            echo "next moved together, and the scaffold-owned deploy files rewritten"
            echo "to this release's shape. Files with local edits were left alone;"
            echo "this workflow run's log names any it skipped."
            echo
            echo "Before merging and deploying:"
            echo
            echo "1. Read the release notes — their Migrations line says what this"
            echo "   release does to the schema:"
            echo "   https://github.com/meith-dev/meith/releases/tag/v$VERSION"
            echo "2. Take a backup. Migrations are forward-only; the backup is the"
            echo "   rollback."
            echo
            echo "After the new version deploys, run 'meith upgrade' once against the"
            echo "board — the admin panel shows a notice until it has run. See"
            echo "README.md, \\"Upgrading\\"."
          } > "$BODY"
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git checkout -B meith-update
          git add -A
          git commit -m "Update Meith to $VERSION"
          git push -f origin meith-update
          gh pr create --title "Update Meith to $VERSION" --body-file "$BODY" \\
            || gh pr edit meith-update --title "Update Meith to $VERSION" --body-file "$BODY"
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
# and, in the meith repository, docs/operations/docker-compose.md,
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

# Uploaded files — avatars, board images, attachments — land here, and the
# compose file mounts the persistent "uploads" volume over this path. Creating
# it in the image, owned by node, is what lets the fresh volume inherit that
# ownership; UPLOADS_DIR gives the board an absolute path so the working
# directory never decides where uploads go. Without both, uploads land on the
# container's own layer and a redeploy discards them.
ENV UPLOADS_DIR=/app/.uploads
RUN mkdir -p /app/.uploads && chown node:node /app/.uploads

# The ring of backup bundles the admin panel's Backups screen writes, lists
# and prunes, and the postgres client tools \`meith backup\` and the panel's
# backups dump with. The compose file mounts the persistent "backups" volume
# over this path.
RUN apk add --no-cache postgresql18-client
ENV BACKUP_DIR=/backups
RUN mkdir -p /backups && chown node:node /backups

# \`meith <command>\` on PATH runs this board's own operator CLI — the same one
# node_modules/.bin/meith is — so a Coolify terminal or \`docker compose exec web
# meith ...\` needs no path. It cd's to /board so the CLI finds this board's
# config, and overrides any wrapper an inherited base image installed, which
# would target the board that image was built from, not this one.
RUN printf '#!/bin/sh\\ncd /board\\nexec node_modules/.bin/meith "$@"\\n' > /usr/local/bin/meith \\
  && chmod +x /usr/local/bin/meith

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
# docs/operations/docker-compose.md, "Custom boards", and docker/Dockerfile.base for what
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

# Uploaded files — avatars, board images, attachments — land here, and the
# compose file mounts the persistent "uploads" volume over this path. Creating
# it in the image, owned by node, is what lets the fresh volume inherit that
# ownership; UPLOADS_DIR gives the board an absolute path so the working
# directory never decides where uploads go. Without both, uploads land on the
# container's own layer and a redeploy discards them.
ENV UPLOADS_DIR=/app/.uploads
RUN mkdir -p /app/.uploads && chown node:node /app/.uploads

# The ring of backup bundles the admin panel's Backups screen writes, lists
# and prunes, and the postgres client tools \`meith backup\` and the panel's
# backups dump with. The compose file mounts the persistent "backups" volume
# over this path.
RUN apk add --no-cache postgresql18-client
ENV BACKUP_DIR=/backups
RUN mkdir -p /backups && chown node:node /backups

# \`meith <command>\` on PATH runs this board's own operator CLI — the same one
# node_modules/.bin/meith is — so a Coolify terminal or \`docker compose exec web
# meith ...\` needs no path. It cd's to /board so the CLI finds this board's
# config, and overrides any wrapper an inherited base image installed, which
# would target the board that image was built from, not this one.
RUN printf '#!/bin/sh\\ncd /board\\nexec node_modules/.bin/meith "$@"\\n' > /usr/local/bin/meith \\
  && chmod +x /usr/local/bin/meith

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
# \`docker compose run --rm web meith --help\` (or \`exec\` into the running
# container) should run the CLI rather than silently starting the web server.
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
      FILESTORE_DRIVER: local
      # So that "back up before migrating" (a board setting) can ship the
      # bundle it takes to the same off-site destination the web container
      # uses. Unset until the four required values are filled in on the
      # Coolify resource.
      BACKUP_S3_BUCKET: \${BACKUP_S3_BUCKET:-}
      BACKUP_S3_REGION: \${BACKUP_S3_REGION:-}
      BACKUP_S3_ACCESS_KEY_ID: \${BACKUP_S3_ACCESS_KEY_ID:-}
      BACKUP_S3_SECRET_ACCESS_KEY: \${BACKUP_S3_SECRET_ACCESS_KEY:-}
      BACKUP_S3_ENDPOINT: \${BACKUP_S3_ENDPOINT:-}
      BACKUP_S3_PREFIX: \${BACKUP_S3_PREFIX:-}
      BACKUP_WEBDAV_URL: \${BACKUP_WEBDAV_URL:-}
      BACKUP_WEBDAV_USERNAME: \${BACKUP_WEBDAV_USERNAME:-}
      BACKUP_WEBDAV_PASSWORD: \${BACKUP_WEBDAV_PASSWORD:-}
    volumes:
      # Both volumes, so that the bundle "back up before migrating" writes
      # carries the uploads and lands in the same ring as every other backup.
      - uploads:/app/.uploads
      - backups:/backups
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
      # The off-site backup destination, unset until the four required values
      # are filled in on the Coolify resource. Coolify only hands a compose
      # service the variables the file names, so a Scheduled Task running
      # \`meith backup\` in this container would never see them without these
      # lines — see the meith repository's
      # docs/operations/coolify.md, "Set up backups".
      - BACKUP_S3_BUCKET=\${BACKUP_S3_BUCKET:-}
      - BACKUP_S3_REGION=\${BACKUP_S3_REGION:-}
      - BACKUP_S3_ACCESS_KEY_ID=\${BACKUP_S3_ACCESS_KEY_ID:-}
      - BACKUP_S3_SECRET_ACCESS_KEY=\${BACKUP_S3_SECRET_ACCESS_KEY:-}
      - BACKUP_S3_ENDPOINT=\${BACKUP_S3_ENDPOINT:-}
      - BACKUP_S3_PREFIX=\${BACKUP_S3_PREFIX:-}
      - BACKUP_WEBDAV_URL=\${BACKUP_WEBDAV_URL:-}
      - BACKUP_WEBDAV_USERNAME=\${BACKUP_WEBDAV_USERNAME:-}
      - BACKUP_WEBDAV_PASSWORD=\${BACKUP_WEBDAV_PASSWORD:-}
    volumes:
      - uploads:/app/.uploads
      # The ring of backup bundles: what the admin panel's Backups screen
      # writes, lists and downloads, and what \`meith backup --dir /backups\`
      # writes. A named volume rather than the container filesystem, so the
      # ring survives every redeploy.
      - backups:/backups
    depends_on:
      postgres:
        condition: service_healthy
      migrate:
        condition: service_completed_successfully

  # @meith/worker is not published (see the meith repository's
  # docs/contributing/release.md), so there is no compiled worker binary a scaffolded
  # board can run — this drives the tick the alternative way the meith
  # repository documents in docs/operations/docker-compose.md, "Running the tick without
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
  backups:
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
      FILESTORE_DRIVER: local
      # So that "back up before migrating" (a board setting) can ship the
      # bundle it takes to the same off-site destination the web container
      # uses. Unset until the four required values are filled in on the
      # Coolify resource.
      BACKUP_S3_BUCKET: \${BACKUP_S3_BUCKET:-}
      BACKUP_S3_REGION: \${BACKUP_S3_REGION:-}
      BACKUP_S3_ACCESS_KEY_ID: \${BACKUP_S3_ACCESS_KEY_ID:-}
      BACKUP_S3_SECRET_ACCESS_KEY: \${BACKUP_S3_SECRET_ACCESS_KEY:-}
      BACKUP_S3_ENDPOINT: \${BACKUP_S3_ENDPOINT:-}
      BACKUP_S3_PREFIX: \${BACKUP_S3_PREFIX:-}
      BACKUP_WEBDAV_URL: \${BACKUP_WEBDAV_URL:-}
      BACKUP_WEBDAV_USERNAME: \${BACKUP_WEBDAV_USERNAME:-}
      BACKUP_WEBDAV_PASSWORD: \${BACKUP_WEBDAV_PASSWORD:-}
    volumes:
      # Both volumes, so that the bundle "back up before migrating" writes
      # carries the uploads and lands in the same ring as every other backup.
      - uploads:/app/.uploads
      - backups:/backups
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
      # The off-site backup destination, unset until the four required values
      # are filled in on the Coolify resource. Coolify only hands a compose
      # service the variables the file names, so a Scheduled Task running
      # \`meith backup\` in this container would never see them without these
      # lines — see the meith repository's
      # docs/operations/coolify.md, "Set up backups".
      - BACKUP_S3_BUCKET=\${BACKUP_S3_BUCKET:-}
      - BACKUP_S3_REGION=\${BACKUP_S3_REGION:-}
      - BACKUP_S3_ACCESS_KEY_ID=\${BACKUP_S3_ACCESS_KEY_ID:-}
      - BACKUP_S3_SECRET_ACCESS_KEY=\${BACKUP_S3_SECRET_ACCESS_KEY:-}
      - BACKUP_S3_ENDPOINT=\${BACKUP_S3_ENDPOINT:-}
      - BACKUP_S3_PREFIX=\${BACKUP_S3_PREFIX:-}
      - BACKUP_WEBDAV_URL=\${BACKUP_WEBDAV_URL:-}
      - BACKUP_WEBDAV_USERNAME=\${BACKUP_WEBDAV_USERNAME:-}
      - BACKUP_WEBDAV_PASSWORD=\${BACKUP_WEBDAV_PASSWORD:-}
    volumes:
      - uploads:/app/.uploads
      # The ring of backup bundles: what the admin panel's Backups screen
      # writes, lists and downloads, and what \`meith backup --dir /backups\`
      # writes. A named volume rather than the container filesystem, so the
      # ring survives every redeploy.
      - backups:/backups
    depends_on:
      postgres:
        condition: service_healthy
      migrate:
        condition: service_completed_successfully

  # @meith/worker is not published (see the meith repository's
  # docs/contributing/release.md), so there is no compiled worker binary a scaffolded
  # board can run — this drives the tick the alternative way the meith
  # repository documents in docs/operations/docker-compose.md, "Running the tick without
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
  backups:
`,
  )

  files.set(
    'docker-compose.byhand.yaml',
    `# ${name}, deployed by Docker Compose without a panel — your own \`.env\`,
# your own reverse proxy, no Coolify. The same four services as
# docker-compose.yaml and docker-compose.prebuilt.yaml above it (db,
# migrate, web, worker), reshaped for a machine with nothing generating
# secrets for you: every value Coolify would have filled in — the database
# password, AUTH_SECRET, TICK_SECRET, the board's own address — comes from
# a \`.env\` beside this file instead. See the meith repository's
# docs/operations/docker-compose.md, which this file is
# the last step of.
#
# \`docker compose\` only auto-discovers a file literally named
# docker-compose.yaml, and that name is already spoken for — Coolify's own
# zero-configuration default. Put \`COMPOSE_FILE=docker-compose.byhand.yaml\`
# in \`.env\` once, and every plain \`docker compose ...\` command reads this
# file without a \`-f\`, including the ones the rest of this project's
# documentation already shows you.
#
# \`docker compose up -d --build\` builds \`Dockerfile\` from this repository,
# on this machine — the same trade the quick-start path above takes. For a
# low-spec server, build \`Dockerfile.prebuilt\` somewhere else instead (push
# to GitHub and let \`.github/workflows/build.yml\` do it, or run
# \`docker build -f Dockerfile.prebuilt ...\` by hand) and change the two
# \`build: .\` lines below to \`image: <that image>:<version>\` — the
# substitution docs/operations/docker-compose.md, "Building
# somewhere else", walks through.
services:
  postgres:
    image: postgres:18-alpine@sha256:d3e1620b530c944afa6e887d22eb899824da68e19c52024bf98f5220c88a65b2
    restart: unless-stopped
    mem_limit: \${POSTGRES_MEM_LIMIT:-1g}
    cpus: \${POSTGRES_CPUS:-1}
    logging:
      driver: json-file
      options:
        max-size: 10m
        max-file: '3'
    environment:
      POSTGRES_USER: community
      # Generate with \`openssl rand -hex 32\`, not base64 — this value is
      # substituted into the postgres:// URL below, and base64's alphabet
      # includes \`/\` and \`+\`, which make the connection string unparseable.
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD:-community}
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
      DATABASE_URL: postgres://community:\${POSTGRES_PASSWORD:-community}@postgres:5432/community
      AUTH_SECRET: \${AUTH_SECRET:?AUTH_SECRET must be set}
      TICK_SECRET: \${TICK_SECRET:?TICK_SECRET must be set}
      FILESTORE_DRIVER: local
      # So that "back up before migrating" (a board setting) can ship the
      # bundle it takes to the same off-site destination web uses.
      BACKUP_S3_BUCKET: \${BACKUP_S3_BUCKET:-}
      BACKUP_S3_REGION: \${BACKUP_S3_REGION:-}
      BACKUP_S3_ACCESS_KEY_ID: \${BACKUP_S3_ACCESS_KEY_ID:-}
      BACKUP_S3_SECRET_ACCESS_KEY: \${BACKUP_S3_SECRET_ACCESS_KEY:-}
      BACKUP_S3_ENDPOINT: \${BACKUP_S3_ENDPOINT:-}
      BACKUP_S3_PREFIX: \${BACKUP_S3_PREFIX:-}
      BACKUP_WEBDAV_URL: \${BACKUP_WEBDAV_URL:-}
      BACKUP_WEBDAV_USERNAME: \${BACKUP_WEBDAV_USERNAME:-}
      BACKUP_WEBDAV_PASSWORD: \${BACKUP_WEBDAV_PASSWORD:-}
    volumes:
      - uploads:/app/.uploads
      - backups:/backups
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
    logging:
      driver: json-file
      options:
        max-size: 10m
        max-file: '3'
    ports:
      - '\${PORT:-127.0.0.1:3000}:3000'
    environment:
      DATABASE_URL: postgres://community:\${POSTGRES_PASSWORD:-community}@postgres:5432/community
      AUTH_SECRET: \${AUTH_SECRET:?AUTH_SECRET must be set}
      TICK_SECRET: \${TICK_SECRET:?TICK_SECRET must be set}
      QUEUE_DRIVER: postgres
      CACHE_DRIVER: \${CACHE_DRIVER:-next}
      REDIS_URL: \${REDIS_URL:-}
      FILESTORE_DRIVER: local
      APP_URL: \${APP_URL:-http://localhost:3000}
      # One reverse proxy (Caddy, in the guide's own walkthrough) sits in
      # front of \`web\` — see "Count your proxies" in
      # docs/operations/docker-compose.md.
      TRUSTED_PROXY_HOPS: \${TRUSTED_PROXY_HOPS:-1}
      # Leaving this at \`log\` does not mean no mail: it means the board
      # decides, from the installer on first run or from
      # /admin/settings?group=mail afterwards, with no redeploy. Setting it
      # here makes this file authoritative instead.
      MAIL_DRIVER: \${MAIL_DRIVER:-log}
      MAIL_FROM: \${MAIL_FROM:-}
      MAIL_HTTP_ENDPOINT: \${MAIL_HTTP_ENDPOINT:-}
      MAIL_HTTP_TOKEN: \${MAIL_HTTP_TOKEN:-}
      MAIL_SMTP_HOST: \${MAIL_SMTP_HOST:-}
      MAIL_SMTP_PORT: \${MAIL_SMTP_PORT:-}
      MAIL_SMTP_SECURITY: \${MAIL_SMTP_SECURITY:-}
      MAIL_SMTP_USERNAME: \${MAIL_SMTP_USERNAME:-}
      MAIL_SMTP_PASSWORD: \${MAIL_SMTP_PASSWORD:-}
      BACKUP_S3_BUCKET: \${BACKUP_S3_BUCKET:-}
      BACKUP_S3_REGION: \${BACKUP_S3_REGION:-}
      BACKUP_S3_ACCESS_KEY_ID: \${BACKUP_S3_ACCESS_KEY_ID:-}
      BACKUP_S3_SECRET_ACCESS_KEY: \${BACKUP_S3_SECRET_ACCESS_KEY:-}
      BACKUP_S3_ENDPOINT: \${BACKUP_S3_ENDPOINT:-}
      BACKUP_S3_PREFIX: \${BACKUP_S3_PREFIX:-}
      BACKUP_WEBDAV_URL: \${BACKUP_WEBDAV_URL:-}
      BACKUP_WEBDAV_USERNAME: \${BACKUP_WEBDAV_USERNAME:-}
      BACKUP_WEBDAV_PASSWORD: \${BACKUP_WEBDAV_PASSWORD:-}
    volumes:
      - uploads:/app/.uploads
      - backups:/backups
    depends_on:
      postgres:
        condition: service_healthy
      migrate:
        condition: service_completed_successfully

  # @meith/worker is not published (see the meith repository's
  # docs/contributing/release.md), so there is no compiled worker binary
  # this board can run — a small loop calling /api/system/tick instead, the
  # same shape docker-compose.yaml and docker-compose.prebuilt.yaml use.
  worker:
    image: alpine:3.24@sha256:28bd5fe8b56d1bd048e5babf5b10710ebe0bae67db86916198a6eec434943f8b
    restart: unless-stopped
    mem_limit: \${WORKER_MEM_LIMIT:-64m}
    cpus: \${WORKER_CPUS:-0.25}
    logging:
      driver: json-file
      options:
        max-size: 10m
        max-file: '3'
    environment:
      TICK_SECRET: \${TICK_SECRET:?TICK_SECRET must be set}
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

  # Off by default — see docs/operations/scaling.md before setting
  # CACHE_DRIVER=redis above. This is the server it needs.
  redis:
    profiles: ['redis']
    image: valkey/valkey:9-alpine@sha256:a174b894902bd3367e330d47cc2054367dc4917701776aaf336f41d83b65ec7a
    restart: unless-stopped
    mem_limit: \${REDIS_MEM_LIMIT:-256m}
    cpus: \${REDIS_CPUS:-0.5}
    logging:
      driver: json-file
      options:
        max-size: 10m
        max-file: '3'
    healthcheck:
      test: ['CMD', 'valkey-cli', 'ping']
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
  uploads:
  backups:
`,
  )

  files.set(
    'README.md',
    `# ${name}

A community board built on [Meith](${repositoryUrl}).

## Choose a deployment

| Route | File | Where the image builds |
|---|---|---|
| Quick start with Coolify | \`docker-compose.yaml\` | Your server |
| Advanced / prebuilt | \`docker-compose.prebuilt.yaml\` | GitHub Actions or another build machine |
| Docker Compose without a panel | \`docker-compose.byhand.yaml\` | Your server |

Use one route for a deployment. The [Coolify guide](${repositoryUrl}/blob/main/docs/operations/coolify.md) and [Docker Compose guide](${repositoryUrl}/blob/main/docs/operations/docker-compose.md) cover prerequisites, secrets, domains and recovery.

### Quick start with Coolify

1. Push this repository to GitHub.
2. Create a Git repository resource in Coolify with the Docker Compose build pack and \`/docker-compose.yaml\` as the Compose file.
3. Assign the board's domain and deploy. Coolify supplies database and authentication secrets; save a protected recovery copy.
4. Confirm \`postgres\` is healthy, \`migrate\` exits successfully, and \`web\` and \`worker\` run.
5. Open \`/install\`, unlock with \`AUTH_SECRET\`, and create the board and its first administrator. The installer seals itself and returns 404 after completion.

A push alone does not rebuild this route. Use Coolify's **Redeploy** after pushing. If the server cannot complete the build, use the prebuilt route.

### Advanced / prebuilt

1. Let \`.github/workflows/build.yml\` finish in GitHub Actions. It builds and publishes your board's image.
2. Make that image accessible to Coolify and select \`/docker-compose.prebuilt.yaml\`.
3. Set \`MEITH_IMAGE\` to the exact image from the workflow summary. The commit tag uses \`\${{ github.sha }}\`; \`:latest\` follows later builds and can change on redeploy.
4. Deploy and complete \`/install\` as above.

For a local image build, the build argument comes from the board's pinned package:

\`\`\`sh
docker build -f Dockerfile.prebuilt --build-arg MEITH_VERSION=$(node -p "require('./package.json').dependencies['@meith/web']") -t ${name} .
\`\`\`

After changing the board, wait for its new image and update \`MEITH_IMAGE\` if pinned to a commit, then redeploy.

## Run locally

\`\`\`sh
npm install
npm run dev
\`\`\`

Open \`http://localhost:3000\`. Without \`DATABASE_URL\`, this is a read-only fixture preview. For persistent registration and posting, follow [Create a writable local board](${repositoryUrl}/blob/main/docs/operations/local-board.md).

## Configure the community

- \`meith.config.ts\` registers themes and board configuration.
- \`board.plugins.json\` and \`meith.plugins.ts\` register installed plugins.
- \`/admin\` manages forums, members, permissions and settings.
- \`npm run meith -- --help\` lists operator commands.

Before inviting members, [test email delivery](${repositoryUrl}/blob/main/docs/operations/mail.md), verify [scheduled work](${repositoryUrl}/blob/main/docs/operations/scheduled-tasks.md), and [configure backups](${repositoryUrl}/blob/main/docs/operations/backups.md). The log mail driver delivers nothing. This deployment's worker calls the web application's tick endpoint. For a manual development run, use \`npm run meith -- task:run\`.

## Install an extension

Add a plugin from this checkout:

\`\`\`sh
npm run meith -- plugin:add @meith/plugin-dues
\`\`\`

Commit the package and registry changes, build and deploy, then apply plugin migrations with \`meith upgrade\` against the deployed board. Follow [Install plugins and themes](${repositoryUrl}/blob/main/docs/operations/installing.md) for the full procedure and theme registration. Installing a package into a running container does not make it part of the next deployment.

## Upgrading

\`.github/workflows/update.yml\` checks weekly and opens an update pull request. It also supports **Run workflow**. Enable **Allow GitHub Actions to create and approve pull requests** under **Settings → Actions → General**.

Review the release notes, take a backup, and inspect any scaffold files the updater left for manual reconciliation. Merge, rebuild and redeploy; then run \`meith upgrade\` for plugin migrations. Core migrations run through the deployment's migration service. Migrations are forward-only; recovery uses a backup.

To prepare the update locally:

\`\`\`sh
npx create-meith@latest update
\`\`\`

The updater moves package pins and supported deployment files together. Its package update includes these commands; running them alone does not update deployment files:

\`\`\`sh
npm install --save-exact @meith/web@latest @meith/cli@latest @meith/theme-default@latest
npm install --save-exact next@$(node -p "require('./node_modules/@meith/web/package.json').dependencies.next")
\`\`\`

Keep Next.js aligned with \`@meith/web\`. Use \`--save-exact\`: a caret range is not a legal Docker image tag. Read [Upgrade Meith](${repositoryUrl}/blob/main/docs/operations/upgrading.md) before applying the change.
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

A community board built on [Meith](${repositoryUrl}), deployed as Vercel functions.

[![Deploy with Vercel](https://vercel.com/button)](${deployButtonUrl(templateRepositoryUrl)})

## 1. Connect services and set secrets

The deployment template requests Neon PostgreSQL, Upstash Redis, Vercel Blob and Resend. Keep access to these service accounts and review their current limits and pricing.

Generate two independent secrets:

\`\`\`sh
openssl rand -hex 32
openssl rand -hex 32
\`\`\`

Use them for \`AUTH_SECRET\` and \`CRON_SECRET\`. Each must be at least 32 characters. Keep a recovery copy of the original \`AUTH_SECRET\`; it seals stored secrets.

The platform derives the following defaults when you have not supplied explicit overrides:

\`\`\`ini
${VERCEL_DERIVED_DRIVERS.join('\n')}
\`\`\`

| Service value | Meith uses it for |
|---|---|
| \`DATABASE_URL\` | Runtime database connection |
| \`DATABASE_URL_UNPOOLED\`, falling back to \`POSTGRES_URL_NON_POOLING\` | \`DIRECT_DATABASE_URL\` for migrations and installer locks |
| \`KV_URL\` | \`REDIS_URL\`; the Redis protocol connection, not the HTTP REST endpoint |
| \`BLOB_STORE_ID\` | Upload storage authenticated through the deployment identity |
| \`RESEND_API_KEY\`, \`RESEND_EMAIL_DOMAIN\` | HTTP mail credentials and sender |

If a required service configuration is missing, Meith refuses to boot rather than guess. Inspect the named variables in the deployment log. See [Vercel configuration](${repositoryUrl}/blob/main/docs/operations/vercel-configuration.md) for explicit overrides.

## 2. Deploy and install

The build command is \`${VERCEL_BUILD_COMMAND}\`. It applies core migrations before building. Keep preview deployments on a separate database if they must not migrate production.

When the deployment succeeds, open \`/install\`. Unlock with \`AUTH_SECRET\`, confirm the permanent public board address, and create the first administrator. Installation seals the route; \`/install\` then returns 404.

## Mail

Mail needs no variables after the deploy when the Resend integration supplies both \`RESEND_API_KEY\` and \`RESEND_EMAIL_DOMAIN\`. The default sender is \`${RESEND_SENDER_MAILBOX}@\` followed by that domain. Verify the sending domain with Resend and send a test from **Admin → Settings → Mail**.

To send from a different address, set \`MAIL_FROM\` and redeploy. The address must be allowed by your provider. Missing sender configuration can leave mail on the log driver, which delivers nothing.

For another HTTP provider, set \`MAIL_DRIVER=http\`, \`MAIL_HTTP_ENDPOINT\`, \`MAIL_HTTP_TOKEN\` and \`MAIL_FROM\`; endpoint and token must be supplied together. See [Email configuration](${repositoryUrl}/blob/main/docs/operations/mail.md).

## 3. Verify scheduled work and hosting limits

\`vercel.json\` calls \`${TICK_PATH}\` on \`${TICK_SCHEDULE}\`: once a day. That cadence can delay notifications, search indexing and queued work. Time-sensitive plugin work can miss its useful delivery window.

Choose a cadence supported by your current plan, or use an external scheduler authenticated with an independently generated \`TICK_SECRET\`. The endpoint accepts \`CRON_SECRET\` or \`TICK_SECRET\`. A paid plan may provide more scheduling options; check [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).

The tick declares \`maxDuration = 300\`. Check the project's Fluid Compute setting and [function duration limit](https://vercel.com/docs/functions/configuring-functions/duration) before deploying; an unsupported duration can fail deployment. Upload limits also come from the platform, regardless of the board's attachment settings.

Inspect task results, not only HTTP status: a tick can return 200 with \`ok: false\` and failed tasks in \`ran\`. Follow [Scheduled tasks](${repositoryUrl}/blob/main/docs/operations/scheduled-tasks.md) and test real posting, uploads and email before inviting members.

## Upgrading

\`.github/workflows/update.yml\` opens a weekly update pull request and supports **Run workflow**. Enable **Allow GitHub Actions to create and approve pull requests** under **Settings → Actions → General**.

Read the release notes and take a backup before merging. Vercel redeploys the merged code and applies core migrations during the build. Apply plugin migrations with the operator CLI using the deployment's environment. Migrations are forward-only.

To prepare the update locally:

\`\`\`sh
npx create-meith@latest update
\`\`\`

The updater also reconciles supported deployment files. Its package update keeps Meith and Next.js aligned:

\`\`\`sh
npm install --save-exact @meith/web@latest @meith/cli@latest @meith/theme-default@latest
npm install --save-exact next@$(node -p "require('./node_modules/@meith/web/package.json').dependencies.next")
\`\`\`

See [Upgrade Meith](${repositoryUrl}/blob/main/docs/operations/upgrading.md) for validation and recovery.

## Leaving Vercel

Run backups from a checkout with the correct hosted database credentials and PostgreSQL tools. Set \`FILESTORE_DRIVER=blob\` and a store's \`BLOB_READ_WRITE_TOKEN\`; a local CLI cannot use the deployment's identity. Blob backups include uploads **by default**.

With that environment selected and a writable output directory:

\`\`\`sh
npm run meith -- backup --out ./board-backup.tar.gz --uploads include
\`\`\`

Check the result and bundle manifest. Preserve the original \`AUTH_SECRET\` separately. Restore into an empty destination and verify attachments and sign-in before switching traffic or deleting the old services. Follow [Move away from Vercel](${repositoryUrl}/blob/main/docs/operations/leaving-vercel.md) for the complete procedure.
`
}

export function nextSteps(name: string): readonly string[] {
  return [`cd ${name}`, 'npm install', 'npm run dev']
}
