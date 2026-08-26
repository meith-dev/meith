#!/bin/sh
set -e

BOARD_NAME=${1:-}
if [ -z "$BOARD_NAME" ]; then
  echo "create-board: a board name is required." >&2
  echo "Usage: curl -fsSL https://www.meith.dev/create-board.sh | bash -s -- my-board" >&2
  exit 1
fi

if ! printf '%s' "$BOARD_NAME" | grep -Eq '^[a-z0-9][a-z0-9._-]{0,213}$'; then
  echo "create-board: use lower-case letters, digits, dots, hyphens and underscores, starting with a letter or digit." >&2
  exit 1
fi

if [ -d "$BOARD_NAME" ] && [ -n "$(ls -A "$BOARD_NAME" 2>/dev/null)" ]; then
  echo "create-board: $BOARD_NAME already exists and is not empty." >&2
  echo "Refusing to write into it — pick another name, or empty it first." >&2
  exit 1
fi

mkdir -p "$BOARD_NAME"

mkdir -p "$(dirname -- "$BOARD_NAME/package.json")"
cat > "$BOARD_NAME/package.json" <<'MEITH_SCAFFOLD_EOF'
{
  "name": "__MEITH_BOARD_NAME__",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "forum-web dev",
    "build": "forum-web build",
    "start": "forum-web start",
    "community": "community"
  },
  "dependencies": {
    "@meith/web": "0.21.2",
    "@meith/cli": "0.21.2",
    "@meith/theme-default": "0.21.2",
    "next": "16.3.1"
  },
  "engines": {
    "node": ">=22"
  }
}
MEITH_SCAFFOLD_EOF

mkdir -p "$(dirname -- "$BOARD_NAME/.npmrc")"
cat > "$BOARD_NAME/.npmrc" <<'MEITH_SCAFFOLD_EOF'
# Every @meith/* dependency here is an exact version, not a range — see
# README.md, "Upgrading", for why a range breaks the build. This makes that
# the default for any `npm install` run in this project from here on,
# including a plugin installed by hand later, not only the four packages
# the scaffold pinned itself.
save-exact=true
MEITH_SCAFFOLD_EOF

mkdir -p "$(dirname -- "$BOARD_NAME/community.config.ts")"
cat > "$BOARD_NAME/community.config.ts" <<'MEITH_SCAFFOLD_EOF'
/**
 * The board's build-time registry.
 *
 * Everything installable is named here, statically, so the bundler can see it
 * and the compiler can check it. Nothing is discovered by scanning a directory
 * at runtime — a production build contains only what the bundler could see, so a
 * directory walked at request time is empty and a plugin "installed" that way is
 * not there at all.
 *
 * Adding a theme is: `npm install` it, add a line here, redeploy. Adding a
 * plugin is the same, through board.plugins.json and community.plugins.ts —
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

import { INSTALLED_PLUGINS } from './community.plugins'

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
MEITH_SCAFFOLD_EOF

mkdir -p "$(dirname -- "$BOARD_NAME/board.plugins.json")"
cat > "$BOARD_NAME/board.plugins.json" <<'MEITH_SCAFFOLD_EOF'
{
  "plugins": []
}
MEITH_SCAFFOLD_EOF

mkdir -p "$(dirname -- "$BOARD_NAME/community.plugins.ts")"
cat > "$BOARD_NAME/community.plugins.ts" <<'MEITH_SCAFFOLD_EOF'
/**
 * The board's installed-plugin list.
 *
 * Inside the Meith monorepo this file is generated from board.plugins.json
 * by `pnpm board:gen` (see docs/customization/plugins.md) — that generator is
 * repository tooling, not something this workspace carries, so this file
 * starts as a plain, valid file with the same shape instead. Add a plugin by
 * importing its `plugin`/`messages` exports and adding an entry:
 *
 *   import { messages as greeterMessages, plugin as greeterPlugin } from '@meith/plugin-greeter'
 *
 *   export const INSTALLED_PLUGINS: readonly InstalledPlugin<PluginDefinition>[] = [
 *     { key: 'greeter', enabled: true, plugin: greeterPlugin, messages: greeterMessages },
 *   ]
 *
 * and the matching entry in board.plugins.json, which is what
 * `community plugin:add`/`plugin:remove` read inside the monorepo — kept
 * here too so the two files agree about what is installed.
 */
import type { InstalledPlugin } from '@meith/web/config'

export const INSTALLED_PLUGINS: readonly InstalledPlugin[] = []

export function installedPluginDefinitions() {
  return INSTALLED_PLUGINS.filter(
    (entry) => entry.enabled !== false && entry.plugin !== undefined,
  ).map((entry) => entry.plugin)
}
MEITH_SCAFFOLD_EOF

mkdir -p "$(dirname -- "$BOARD_NAME/.env.example")"
cat > "$BOARD_NAME/.env.example" <<'MEITH_SCAFFOLD_EOF'
# __MEITH_BOARD_NAME__ — environment.
#
# Copy to .env.local for development. On the server this is `.env` beside the
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

# The other half of that pair: the DIRECT (non-pooler) string, used only by
# `community migrate` and `community backup`. Migrations hold a session-level
# advisory lock so that two deploys landing together queue instead of both
# applying the same migration, and a transaction-mode pooler cannot hold that
# lock: it takes the connection back the moment the lock statement ends, which
# leaves the lock on a backend another client gets. Set both and each gets the
# connection it needs; set only DATABASE_URL and migrations use it too, which is
# right for a Postgres you run yourself.
# DIRECT_DATABASE_URL=

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
# what `npm run build` uses, and what a checkout with no database falls back to.
DATA_SOURCE=postgres

# Absolute, no trailing slash. Used in mail, feeds and canonical URLs — every
# place a relative URL cannot work because there is no request to be relative to.
#
# Optional: leave it blank and the installer asks, prefilled from the address you
# load /install at, and stores the answer on the board where the settings screen
# can change it without a redeploy. Set it here and it wins outright.
APP_URL=

# Mail. Leave these alone and the installer asks for mail on first run, storing
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
# MAIL_FROM=noreply@yourdomain.com

MEITH_SCAFFOLD_EOF

mkdir -p "$(dirname -- "$BOARD_NAME/.gitignore")"
cat > "$BOARD_NAME/.gitignore" <<'MEITH_SCAFFOLD_EOF'
node_modules
.next
.meith
.env
.env.local
.env*.local
*.log
.DS_Store
MEITH_SCAFFOLD_EOF

mkdir -p "$(dirname -- "$BOARD_NAME/Dockerfile")"
cat > "$BOARD_NAME/Dockerfile" <<'MEITH_SCAFFOLD_EOF'
# syntax=docker/dockerfile:1.7-labs
# check=skip=InvalidDefaultArgInFrom
# __MEITH_BOARD_NAME__'s deploy image.
#
# FROM the published framework base image — deps + framework layers only,
# locked to this exact release (see the meith repository's
# docs/getting-started/deployment/docker-compose.md, "Custom boards", and docker/Dockerfile.base for what
# it is and is not). This board's own Dockerfile only ever installs its own
# delta on top of it — a new plugin's own dependency, typically nothing more
# — which is what keeps a rebuild after `npm install some-plugin` a matter
# of minutes rather than a cold toolchain build.
#
# Two stages, not three: unlike the official image, this does not prune down
# to Next's own standalone output. The migrate role below runs `community
# migrate`, and `community` materializes @meith/cli's sources and runs them
# with tsx at the moment it runs (see the meith repository's
# docs/contributing/development.md, "Consuming the board from a workspace") — it needs
# the full, un-pruned node_modules tree this board installed, not what Next
# traced as reachable from the web server alone. The tick itself is driven
# by docker-compose.yml's own `worker` service — a lightweight loop against
# /api/system/tick, not a compiled worker process, because @meith/worker is
# not published (see the meith repository's docs/contributing/release.md).
ARG MEITH_VERSION
FROM ghcr.io/meith-dev/meith-base:${MEITH_VERSION} AS deps
WORKDIR /board

# This board's own manifest, cached independently of its source — editing
# community.config.ts should not re-run npm install. The base image above
# already carries node_modules for @meith/web, @meith/cli and
# @meith/theme-default at this exact version, so installing this file on top
# of it only fetches what changed: a plugin newly added to `dependencies`,
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
# what DATABASE_URL an operator supplies to `docker run`.
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

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["./docker-healthcheck.sh"]

ENTRYPOINT ["./docker-entrypoint.sh"]
MEITH_SCAFFOLD_EOF

mkdir -p "$(dirname -- "$BOARD_NAME/docker-entrypoint.sh")"
cat > "$BOARD_NAME/docker-entrypoint.sh" <<'MEITH_SCAFFOLD_EOF'
#!/bin/sh
# One image, two roles — see Dockerfile and README.md.
#
# "web" (the default) runs the board; "migrate" applies the schema and
# exits. There is no "worker" role in this image: @meith/worker is not
# published, so nothing here can run it — docker-compose.yml's own `worker`
# service drives the tick a different way, calling this image's web role
# over HTTP instead of running as a role of this image.
set -e

# An explicit command wins over the role, the same as the official image —
# `docker run <image> node_modules/.bin/community --help` should still run
# the CLI rather than silently starting the web server.
if [ "$#" -gt 0 ]; then
  exec "$@"
fi

case "${COMMUNITY_ROLE:-web}" in
  migrate)
    # Runs to completion and exits; compose's one-shot service waits on it.
    exec node_modules/.bin/community migrate
    ;;
  web)
    exec node_modules/.bin/forum-web start
    ;;
  *)
    echo "Unknown COMMUNITY_ROLE: ${COMMUNITY_ROLE}. Expected 'web' or 'migrate'." >&2
    exit 1
    ;;
esac
MEITH_SCAFFOLD_EOF

mkdir -p "$(dirname -- "$BOARD_NAME/docker-healthcheck.sh")"
cat > "$BOARD_NAME/docker-healthcheck.sh" <<'MEITH_SCAFFOLD_EOF'
#!/bin/sh
# What "healthy" means depends on the role — see docker-entrypoint.sh.
# "migrate" runs to completion and exits; its exit code is the verdict, and
# a health probe taken while it runs has no opinion.
set -e

if [ "${COMMUNITY_ROLE:-web}" = "migrate" ]; then
  exit 0
fi

node -e "fetch('http://127.0.0.1:3000/api/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
MEITH_SCAFFOLD_EOF

mkdir -p "$(dirname -- "$BOARD_NAME/.dockerignore")"
cat > "$BOARD_NAME/.dockerignore" <<'MEITH_SCAFFOLD_EOF'
node_modules
.next
.meith
.git
.env
.env.local
*.log
MEITH_SCAFFOLD_EOF

mkdir -p "$(dirname -- "$BOARD_NAME/.github/workflows/build.yml")"
cat > "$BOARD_NAME/.github/workflows/build.yml" <<'MEITH_SCAFFOLD_EOF'
# Builds this board's image and pushes it to your own GHCR, on every push to
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
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      # GHCR requires a lower-case image name, and neither your GitHub
      # username nor this repository's name is guaranteed to be.
      - name: Build and push
        run: |
          IMAGE=$(echo "ghcr.io/${{ github.repository }}" | tr '[:upper:]' '[:lower:]')
          MEITH_VERSION=$(node -p "require('./package.json').dependencies['@meith/web']")
          if ! echo "$MEITH_VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$'; then
            echo "::error::@meith/web in package.json is '$MEITH_VERSION', not an exact X.Y.Z version — that is not a legal Docker image tag. Upgrade with \`npm install --save-exact\` (see README.md, Upgrading) so this dependency always resolves to one."
            exit 1
          fi
          docker build --build-arg MEITH_VERSION="$MEITH_VERSION" -t "$IMAGE:${{ github.sha }}" -t "$IMAGE:latest" .
          docker push "$IMAGE:${{ github.sha }}"
          docker push "$IMAGE:latest"

      - name: Summary
        run: |
          IMAGE=$(echo "ghcr.io/${{ github.repository }}" | tr '[:upper:]' '[:lower:]')
          REPO_LOWER=$(echo "${{ github.repository }}" | tr '[:upper:]' '[:lower:]')
          PKG_NAME=$(echo "$REPO_LOWER" | cut -d/ -f2)
          PKG_URL="https://github.com/$REPO_LOWER/pkgs/container/$PKG_NAME"
          {
            echo "## Deploy this image"
            echo
            echo "Paste this into the MEITH_IMAGE variable on the Coolify resource:"
            echo
            echo "    $IMAGE:${{ github.sha }}"
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
MEITH_SCAFFOLD_EOF

mkdir -p "$(dirname -- "$BOARD_NAME/docker-compose.yml")"
cat > "$BOARD_NAME/docker-compose.yml" <<'MEITH_SCAFFOLD_EOF'
# __MEITH_BOARD_NAME__, deployed by Coolify — the same shape as the meith repository's own
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
    mem_limit: ${POSTGRES_MEM_LIMIT:-1g}
    cpus: ${POSTGRES_CPUS:-1}
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
    image: ${MEITH_IMAGE:?set this to the image the build workflow's Summary just printed, e.g. ghcr.io/<you>/__MEITH_BOARD_NAME__:latest}
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
    image: ${MEITH_IMAGE:?set this to the image the build workflow's Summary just printed, e.g. ghcr.io/<you>/__MEITH_BOARD_NAME__:latest}
    restart: unless-stopped
    mem_limit: ${WEB_MEM_LIMIT:-1g}
    cpus: ${WEB_CPUS:-2}
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
      - MAIL_DRIVER=${MAIL_DRIVER:-log}
      - MAIL_SMTP_HOST=${MAIL_SMTP_HOST:-}
      - MAIL_SMTP_PORT=${MAIL_SMTP_PORT:-}
      - MAIL_SMTP_SECURITY=${MAIL_SMTP_SECURITY:-}
      - MAIL_SMTP_USERNAME=${MAIL_SMTP_USERNAME:-}
      - MAIL_SMTP_PASSWORD=${MAIL_SMTP_PASSWORD:-}
      - MAIL_FROM=${MAIL_FROM:-}
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
    mem_limit: ${WORKER_MEM_LIMIT:-64m}
    cpus: ${WORKER_CPUS:-0.25}
    environment:
      TICK_SECRET: $SERVICE_BASE64_64_TICK
    command:
      - sh
      - -c
      - |
        apk add --no-cache curl >/dev/null
        while true; do
          curl -fsS -m 55 -H "Authorization: Bearer $$TICK_SECRET" \
            http://web:3000/api/system/tick >/dev/null 2>&1 \
            || echo "tick failed at $$(date -Is)"
          sleep 60
        done
    depends_on:
      - web

volumes:
  pgdata:
  uploads:
MEITH_SCAFFOLD_EOF

mkdir -p "$(dirname -- "$BOARD_NAME/README.md")"
cat > "$BOARD_NAME/README.md" <<'MEITH_SCAFFOLD_EOF'
# __MEITH_BOARD_NAME__

A forum, built on [Meith](https://github.com/meith-dev/meith).

## Deploy

Nothing here builds on your own server — a 2 GB VPS OOMs on a Next.js build,
which is the whole reason `Dockerfile`, `docker-compose.yml` and
`.github/workflows/build.yml` exist: something else builds the image, the
server only ever pulls one. Three steps, nothing to configure by hand beyond
one value only you know:

1. **Push this repository to GitHub.** `.github/workflows/build.yml` builds
   `Dockerfile` on every push to `main` and pushes the result to your own
   GitHub Container Registry, `ghcr.io/<you>/__MEITH_BOARD_NAME__` — using only the
   `GITHUB_TOKEN` every GitHub Actions run already carries. No secret to
   add, no registry account beyond the GitHub account you already have.

   Open the run under the repository's **Actions** tab once it finishes —
   its **Summary** prints the two things left: the exact image to paste
   into step 2 below, and a direct link to the one-time step of making the
   package public. It starts **private**, and Coolify's pull fails with an
   authentication error no operator can act on until that is done.

2. **Point [Coolify](https://coolify.io) at `docker-compose.yml`** — a Docker
   Compose resource, this repository as its source. `docker-compose.yml` already
   carries Coolify's own "magic variables" for `AUTH_SECRET`,
   `TICK_SECRET` and the database password, generated on the first deploy
   and never typed in. The one thing Coolify cannot generate is the image
   step 1 just pushed: set `MEITH_IMAGE` in the resource's own environment
   to the value that run's Summary printed — `ghcr.io/<you>/__MEITH_BOARD_NAME__:${{ github.sha }}`,
   a pin that only ever names that one build (`docker-compose.yml` refuses
   to start without this set, with a message saying why). The same run also
   pushes `ghcr.io/<you>/__MEITH_BOARD_NAME__:latest` as a convenience for a quick manual
   pull, but it moves on every push to `main` — set it on the resource and a
   later, unrelated redeploy can pull whatever `main` most recently built,
   commit still mid-feature included.

3. **Deploy, then `/install` on your own domain.** Coolify issues the
   certificate; the installer from there is the one
   [docs/getting-started/deployment/coolify.md](https://github.com/meith-dev/meith/blob/main/docs/getting-started/deployment/coolify.md#4-run-the-installer)
   walks through, screen for screen. It seals itself when it finishes, and
   `/install` answers 404 from then on — run it **against the database you
   are going to keep**. Every push to `main` after this rebuilds the
   image; Coolify's own **Redeploy** button is what actually pulls it —
   pushing alone does not.

No Docker Hub, no paid CI: GitHub Actions' free tier and GHCR are the whole
build side of this, for a board of any size.

**Building it yourself**: works on any machine with Docker, if you would
rather not use GitHub Actions for the build — push the result wherever
`docker-compose.yml`'s `MEITH_IMAGE` can reach.

```sh
docker build --build-arg MEITH_VERSION=$(node -p "require('./package.json').dependencies['@meith/web']") -t __MEITH_BOARD_NAME__ .
```

**Without a panel**: [docs/getting-started/deployment/docker-compose.md](https://github.com/meith-dev/meith/blob/main/docs/getting-started/deployment/docker-compose.md)
is the same four containers by hand — your own `.env`, a reverse proxy you
already run, no Coolify. `Dockerfile` and `docker-compose.yml` here are this
board's own version of exactly that shape.

Two things nothing configures for you:

- **Mail.** Until `MAIL_DRIVER` and its three settings exist, every message is
  written to the log and delivered to nobody, so password reset fails silently.
- **The tick.** `docker-compose.yml`'s `worker` service drives it here — a small
  loop calling `/api/system/tick` once a minute, since `@meith/web`'s own
  worker package is not something a board outside the meith monorepo can
  depend on yet. Deploy some other way and something still has to call that
  route (or run `community task:run`) every minute, or nothing catches up
  and nothing errors.

## Local

```sh
npm install
cp .env.example .env.local
npm run dev
```

With no `DATABASE_URL`, the board runs on deterministic in-memory sample data —
enough to click through every reading surface. Posting needs a database:

```sh
npm run community -- migrate
echo "<password>" | npm run community -- user:create --username <name> --email <address> --group administrators
```

## Configuring

- **`community.config.ts`** — installed themes and plugins. Everything installable
  is named here so the bundler can see it; nothing is found by scanning a
  directory at runtime.
- **`/admin`** — settings, forums, groups, members, themes, maintenance. An
  administrator re-enters their password to get in, and again for anything
  destructive.
- **`npm run community -- --help`** — the operator CLI. Everything the panel does
  and a few things it cannot, without a browser.

## Upgrading

```sh
npm install --save-exact @meith/web@latest @meith/cli@latest @meith/theme-default@latest
npm install --save-exact next@$(node -p "require('./node_modules/@meith/web/package.json').dependencies.next")
git commit -am "Upgrade Meith and the Next.js version it builds with"
git push
```

The second command is not optional. This board pins `next` itself, and
nothing bumps it for you: upgrading only the `@meith/*` packages leaves the
board's own pin on the old Next while `@meith/web` depends on the new one,
which npm resolves by installing both — the build then runs on one version
while everything reading `package.json` sees the other. Reading the version
out of the freshly installed `@meith/web` is what keeps the two the same
without anybody having to know the number.

That `package.json` change is the whole pin: `Dockerfile`'s own
`FROM` line takes the version as a build argument, and
`.github/workflows/build.yml` reads it straight out of `package.json`'s
own `@meith/web` dependency when it rebuilds — nothing in `Dockerfile`
itself to keep in sync by hand. `--save-exact` matters: npm's default
`save-prefix` is `^`, and a caret range is not a legal Docker image tag —
without it, this exact command would write `"^0.18.0"` and the next build
would fail with `invalid reference format` instead of building. This
project's own `.npmrc` sets `save-exact=true` for the same reason, so an
`npm install` of anything else here — a plugin, say — stays pinned too; the
build workflow also refuses to build from anything but an exact version, as
a second line of defense. Once the rebuilt image is deployed, run
`npm run community -- upgrade` against it for the plugin migrations — see
[the operator CLI](https://github.com/meith-dev/meith/blob/main/docs/guides/operations/operating.md#the-operator-cli)
for running it against this deployment.

Migrations are forward-only. Recovery is by restore, so take a backup first —
there is no down migration to undo a destructive one, and a button that pretended
otherwise would be worse than its absence.
MEITH_SCAFFOLD_EOF

find "$BOARD_NAME" -type f -exec sh -c \
  'sed "s/__MEITH_BOARD_NAME__/$1/g" "$2" > "$2.meith-tmp" && mv "$2.meith-tmp" "$2"' \
  _ "$BOARD_NAME" {} \;

GIT_READY=0
if command -v git >/dev/null 2>&1 \
  && git -C "$BOARD_NAME" init -q -b main >/dev/null 2>&1 \
  && git -C "$BOARD_NAME" add -A >/dev/null 2>&1; then
  GIT_READY=1
fi

echo "Created $BOARD_NAME — 14 files."
echo
echo "  cd $BOARD_NAME"
echo "  npm install"
echo "  cp .env.example .env.local"
echo "  npm run dev"
echo
if [ "$GIT_READY" = 1 ]; then
  echo "Initialized a git repository here and staged every file. Commit it,"
  echo "add a GitHub remote and push:"
  echo
  echo "  git commit -m \"Scaffold $BOARD_NAME\""
  echo "  git remote add origin https://github.com/<you>/$BOARD_NAME.git"
  echo "  git push -u origin main"
else
  echo "Push it to a new, empty repository on GitHub:"
  echo
  echo "  cd $BOARD_NAME"
  echo "  git init && git add -A && git commit -m \"Scaffold $BOARD_NAME\""
  echo "  git remote add origin https://github.com/<you>/$BOARD_NAME.git"
  echo "  git push -u origin main"
fi
echo
echo "Then set DATABASE_URL, AUTH_SECRET and TICK_SECRET and deploy."
echo "Something must run the tick every minute — the worker process, or"
echo "community task:run. Without it nothing catches up, and nothing errors."
