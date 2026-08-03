/**
 * F82 — the scaffold, as a pure function.
 *
 * `scaffold(options)` returns a map of relative path → file contents. It touches
 * no disk, which is the whole design: the interesting part of a project
 * generator is *what it writes*, and a generator whose output can only be
 * inspected by running it and looking at a directory is a generator nobody
 * tests. `cli.ts` is the thin part that writes the map.
 *
 * ## What the acceptance criterion actually demands
 *
 * "Push-to-deploy works without manual build configuration." That is not "a
 * README that explains what to configure" — it is that the generated repository,
 * pushed to a Vercel project with `DATABASE_URL` set, deploys and runs. Three
 * things have to be right for that, and each has been wrong in this repository
 * at some point:
 *
 *  - **the build must not need a database.** `next build` prerenders, and a build
 *    that opens a connection fails on a preview deployment with no database
 *    attached. The generated app builds in `fixture` mode, exactly as CI does.
 *  - **the cron must be declared in the repository.** Every catch-up operation on
 *    this board runs on the tick — bans expire, digests send, counters
 *    reconcile — and when it does not run, *nothing fails*. A `vercel.json`
 *    committed by the scaffold is the difference between a board that works and
 *    one that silently stops doing anything a month later (F70).
 *  - **the secrets must be named where somebody will see them.** `AUTH_SECRET`
 *    and `TICK_SECRET` are required at startup and have no sensible default, so
 *    they are in `.env.example` with the command that generates one.
 */

export interface ScaffoldOptions {
  /** The project directory name, which is also the package name. */
  readonly name: string
  /** Pinned so a scaffold produces the same tree twice. */
  readonly version: string
  /** The repository a Deploy button points at. */
  readonly repositoryUrl: string
}

export const DEFAULT_REPOSITORY_URL = 'https://github.com/jouwdan/forum-software'

const NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,213}$/

/**
 * Refuse a name npm would refuse, plus the two shapes a filesystem would.
 *
 * Checked here rather than in the CLI so it is tested without spawning
 * anything. `..` and `.` are rejected before the pattern gets a chance, because
 * a project called `..` would scaffold into the parent directory — the one
 * failure of a generator that cannot be undone by deleting a folder.
 */
export function validateName(name: string): string | null {
  if (name === '' ) return 'A project name is required.'
  if (name === '.' || name === '..') return 'That name would write outside the new directory.'
  if (name.includes('/') || name.includes('\\')) return 'A project name cannot contain a path separator.'
  if (name !== name.toLowerCase()) return 'npm package names must be lower-case.'
  if (!NAME_PATTERN.test(name)) {
    return 'Use lower-case letters, digits, dots, hyphens and underscores, starting with a letter or digit.'
  }
  return null
}

/**
 * Every file the scaffold writes.
 *
 * Ordered as a reader would open them: what it is, how to run it, what to
 * configure, what the platform needs.
 */
export function scaffold(options: ScaffoldOptions): ReadonlyMap<string, string> {
  const { name, version, repositoryUrl } = options
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
          dev: 'forum-web dev',
          build: 'forum-web build',
          start: 'forum-web start',
          /* The operator CLI: migrations, users, forums, settings, tasks (F13). */
          forum: 'forum',
        },
        dependencies: {
          '@forum/web': version,
          '@forum/cli': version,
          '@forum/theme-default': version,
        },
        engines: { node: '>=22' },
      },
      null,
      2,
    )}\n`,
  )

  files.set(
    'forum.config.ts',
    `/**
 * The board's build-time registry.
 *
 * Everything installable is named here, statically, so the bundler can see it
 * and the compiler can check it. Nothing is discovered by scanning a directory
 * at runtime — on a serverless platform a directory walked at request time is
 * empty, so a plugin "installed" that way is not there in production.
 *
 * Adding a theme or a plugin is: \`npm install\` it, add a line here, redeploy.
 */
import { defineForumConfig } from '@forum/web/config'
import {
  BROWSER_THEME_COLOR,
  DARK_TOKENS,
  defaultTheme,
  LIGHT_TOKENS,
} from '@forum/theme-default'

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

  /* Plugins are typed manifests, imported here. See docs/plugin-api.md. */
  plugins: [],
})
`,
  )

  files.set(
    '.env.example',
    `# ${name} — environment.
#
# Copy to .env.local for development. On Vercel these are project environment
# variables; nothing here belongs in git.

# ─── Required ────────────────────────────────────────────────────────────────

# The TRANSACTION-MODE POOLER connection string, not the direct one.
#
# This matters more than any other line in this file. A serverless function
# opens its own connection and Postgres' default limit is around 100, so a board
# on the direct string works in testing and starts refusing connections under
# the first real traffic — with an error that names the database rather than the
# cause.
DATABASE_URL=

# Session and token signing. No default, deliberately: a shipped default is a
# board every reader of the source can sign a session for.
#
#   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
AUTH_SECRET=

# The shared secret the cron caller presents to POST /api/system/tick. Generate
# it the same way. Without it the tick is unauthenticated, and the tick is how
# bans expire and digests send.
TICK_SECRET=

# ─── Optional ────────────────────────────────────────────────────────────────

# fixture = deterministic in-memory sample data, no database needed. This is
# what \`npm run build\` uses, and what a preview deployment with no database
# attached falls back to.
DATA_SOURCE=postgres

# Absolute, no trailing slash. Used in mail, feeds and canonical URLs — every
# place a relative URL cannot work because there is no request to be relative to.
PUBLIC_URL=

# Keep comfortably below the platform's function timeout, so the tick finishes
# its batch and reports rather than being killed mid-way.
TICK_DEADLINE_MS=50000
TICK_MAX_JOBS=25
`,
  )

  files.set(
    'vercel.json',
    `${JSON.stringify(
      {
        $schema: 'https://openapi.vercel.sh/vercel.json',
        /*
         * Committed by the scaffold rather than left as a documented step.
         *
         * Every catch-up operation runs on this tick — bans expire, digests
         * send, counters reconcile, uploads are swept, queued mail is
         * delivered — and when it stops, none of them *fail*. They simply do
         * not happen, with no error anywhere, until somebody notices a ban that
         * should have ended last month.
         */
        crons: [{ path: '/api/system/tick', schedule: '* * * * *' }],
      },
      null,
      2,
    )}\n`,
  )

  files.set(
    '.gitignore',
    `node_modules
.next
.env
.env.local
.env*.local
*.log
.DS_Store
`,
  )

  files.set(
    'README.md',
    `# ${name}

A forum, built on [forum-software](${repositoryUrl}).

## Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=${encodeURIComponent(
      repositoryUrl,
    )})

Set \`DATABASE_URL\`, \`AUTH_SECRET\` and \`TICK_SECRET\` in the project's
environment, push, and open \`/install\`.

**Use the transaction-mode pooler connection string.** A serverless function
opens its own connection; on the direct string a board works in testing and
starts refusing connections under the first real traffic.

The cron that drives every catch-up operation is already declared in
\`vercel.json\` — bans expiring, digests sending, counters reconciling. It is
committed rather than documented because when it does not run, nothing fails:
the work simply does not happen.

## Local

\`\`\`sh
npm install
cp .env.example .env.local
npm run dev
\`\`\`

With no \`DATABASE_URL\`, the board runs on deterministic in-memory sample data —
enough to click through every reading surface. Posting needs a database:

\`\`\`sh
npm run forum -- migrate
npm run forum -- user:create --admin
\`\`\`

## Configuring

- **\`forum.config.ts\`** — installed themes and plugins. Everything installable
  is named here so the bundler can see it; nothing is found by scanning a
  directory at runtime.
- **\`/admin\`** — settings, forums, groups, members, themes, maintenance. An
  administrator re-enters their password to get in, and again for anything
  destructive.
- **\`npm run forum -- --help\`** — the operator CLI. Everything the panel does
  and a few things it cannot, without a browser.

## Upgrading

\`\`\`sh
npm install @forum/web@latest @forum/cli@latest
npm run forum -- upgrade
\`\`\`

Migrations are forward-only. Recovery is by restore, so take a backup first —
there is no down migration to undo a destructive one, and a button that pretended
otherwise would be worse than its absence.
`,
  )

  return files
}

/** The lines the CLI prints when it is done. Data, so they can be asserted. */
export function nextSteps(name: string): readonly string[] {
  return [
    `cd ${name}`,
    'npm install',
    'cp .env.example .env.local',
    'npm run dev',
  ]
}
