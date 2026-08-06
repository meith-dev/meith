export interface ScaffoldOptions {
  readonly name: string
  readonly version: string
  readonly repositoryUrl: string
}

export const DEFAULT_REPOSITORY_URL = 'https://github.com/meith-dev/meith'

const NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,213}$/

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
          forum: 'forum',
        },
        dependencies: {
          '@meith/web': version,
          '@meith/cli': version,
          '@meith/theme-default': version,
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
 * at runtime — a production build contains only what the bundler could see, so a
 * directory walked at request time is empty and a plugin "installed" that way is
 * not there at all.
 *
 * Adding a theme or a plugin is: \`npm install\` it, add a line here, redeploy.
 */
import { defineForumConfig } from '@meith/web/config'
import {
  BROWSER_THEME_COLOR,
  DARK_TOKENS,
  defaultTheme,
  LIGHT_TOKENS,
} from '@meith/theme-default'

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
# Copy to .env.local for development. On the server this is \`.env\` beside the
# compose file; nothing here belongs in git.

# ─── Required ────────────────────────────────────────────────────────────────

# Your Postgres connection string.
#
# If it is a managed database that offers a TRANSACTION-MODE POOLER string, use
# that rather than the direct one — Neon, Supabase and their kind hand out both,
# and on the direct string a board works in testing and starts refusing
# connections under the first real traffic, with an error that names the
# database rather than the cause. Your own Postgres, with a fixed number of
# processes in front of it, does not need one.
DATABASE_URL=

# Session and token signing. No default, deliberately: a shipped default is a
# board every reader of the source can sign a session for.
#
#   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
AUTH_SECRET=

# The shared secret the tick caller presents to GET /api/system/tick. Generate
# it the same way. Without it the tick is unauthenticated, and the tick is how
# bans expire and digests send.
TICK_SECRET=

# ─── Optional ────────────────────────────────────────────────────────────────

# fixture = deterministic in-memory sample data, no database needed. This is
# what \`npm run build\` uses, and what a checkout with no database falls back to.
DATA_SOURCE=postgres

# Absolute, no trailing slash. Used in mail, feeds and canonical URLs — every
# place a relative URL cannot work because there is no request to be relative to.
APP_URL=

# Mail. The default writes each message to the server log and SENDS NOTHING, so
# password reset fails silently until this is configured. All three are required
# together once MAIL_DRIVER=http.
# MAIL_DRIVER=http
# MAIL_HTTP_ENDPOINT=https://api.resend.com/emails
# MAIL_HTTP_TOKEN=
# MAIL_FROM=noreply@yourdomain.com

# How long a tick may spend before it yields and finishes the backlog next time.
TICK_DEADLINE_MS=50000
TICK_MAX_JOBS=25
`,
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

A forum, built on [Meith](${repositoryUrl}).

## Deploy

On your own server, anywhere. A board needs three things from wherever it runs,
and this is the shape that gives all three: a scheduler that goes off every
minute, somewhere to keep uploads that survives a restart, and a process that
outlives a request.

The walkthrough is
[docs/quickstart.md](${repositoryUrl}/blob/main/docs/quickstart.md): Coolify on
a fresh server, pointed at the repository, four containers, a certificate, then
\`/install\` on your own domain. Without a panel,
[docs/self-hosting.md](${repositoryUrl}/blob/main/docs/self-hosting.md) is the
same thing by hand. Set \`DATABASE_URL\`, \`AUTH_SECRET\` and \`TICK_SECRET\`
and the rest is defaults.

Run the installer **against the database you are going to keep**: it seals
itself when it finishes, and \`/install\` answers 404 from then on.

Two things nothing configures for you:

- **Mail.** Until \`MAIL_DRIVER\` and its three settings exist, every message is
  written to the log and delivered to nobody, so password reset fails silently.
- **The tick.** It runs in the worker process, which the compose file starts
  beside the web server. Deploy this some other way and something has to run
  \`forum task:run\` every minute, or nothing catches up and nothing errors.

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
npm install @meith/web@latest @meith/cli@latest
npm run forum -- upgrade
\`\`\`

Migrations are forward-only. Recovery is by restore, so take a backup first —
there is no down migration to undo a destructive one, and a button that pretended
otherwise would be worse than its absence.
`,
  )

  return files
}

export function nextSteps(name: string): readonly string[] {
  return [
    `cd ${name}`,
    'npm install',
    'cp .env.example .env.local',
    'npm run dev',
  ]
}
