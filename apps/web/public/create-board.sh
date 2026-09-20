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
    "meith": "meith"
  },
  "dependencies": {
    "@meith/web": "0.37.6",
    "@meith/cli": "0.37.6",
    "@meith/theme-default": "0.37.6",
    "next": "16.3.4"
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

mkdir -p "$(dirname -- "$BOARD_NAME/meith.config.ts")"
cat > "$BOARD_NAME/meith.config.ts" <<'MEITH_SCAFFOLD_EOF'
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
MEITH_SCAFFOLD_EOF

mkdir -p "$(dirname -- "$BOARD_NAME/board.plugins.json")"
cat > "$BOARD_NAME/board.plugins.json" <<'MEITH_SCAFFOLD_EOF'
{
  "plugins": []
}
MEITH_SCAFFOLD_EOF

mkdir -p "$(dirname -- "$BOARD_NAME/meith.plugins.ts")"
cat > "$BOARD_NAME/meith.plugins.ts" <<'MEITH_SCAFFOLD_EOF'
// Generated from board.plugins.json by `meith plugin:add` and `meith plugin:remove`.
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
# `meith migrate` and `meith backup`. Migrations hold a session-level
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

# Derived, and left commented out on purpose: with no DATABASE_URL the board
# serves `fixture` — deterministic in-memory sample data, no database needed,
# which is what `npm run build` uses and what `npm run dev` falls back to — and
# with one it serves `postgres`. Setting it to postgres while DATABASE_URL is
# still blank is refused at boot, so uncomment it only to override the
# derivation.
# DATA_SOURCE=postgres

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

# The off-site backup destination: an S3-compatible bucket `meith backup`
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
# BACKUP_WEBDAV_PASSWORD=

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

mkdir -p "$(dirname -- "$BOARD_NAME/.github/dependabot.yml")"
cat > "$BOARD_NAME/.github/dependabot.yml" <<'MEITH_SCAFFOLD_EOF'
# Keeps this board's GitHub Actions current: one weekly pull request that
# bumps the actions pinned in .github/workflows. Meith itself is updated
# separately, by .github/workflows/update.yml — see README.md, "Upgrading" —
# because the board's `next` pin has to move together with `@meith/web`
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
MEITH_SCAFFOLD_EOF

mkdir -p "$(dirname -- "$BOARD_NAME/.github/workflows/update.yml")"
cat > "$BOARD_NAME/.github/workflows/update.yml" <<'MEITH_SCAFFOLD_EOF'
# Opens a pull request whenever a new Meith release is out — see README.md,
# "Upgrading". Once a week, and on the Run workflow button, it runs the same
# updater you can run by hand, `npx create-meith@latest update`: every
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
# run `meith upgrade` against it. Migrations are forward-only — the backup
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
          GH_TOKEN: ${{ github.token }}
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
            echo "README.md, \"Upgrading\"."
          } > "$BODY"
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git checkout -B meith-update
          git add -A
          git commit -m "Update Meith to $VERSION"
          git push -f origin meith-update
          gh pr create --title "Update Meith to $VERSION" --body-file "$BODY" \
            || gh pr edit meith-update --title "Update Meith to $VERSION" --body-file "$BODY"
MEITH_SCAFFOLD_EOF

mkdir -p "$(dirname -- "$BOARD_NAME/Dockerfile")"
cat > "$BOARD_NAME/Dockerfile" <<'MEITH_SCAFFOLD_EOF'
# syntax=docker/dockerfile:1.7-labs
# check=skip=InvalidDefaultArgInFrom
# __MEITH_BOARD_NAME__'s quick-start deploy image — built from source, with nothing to
# set up first.
#
# FROM node:26-alpine directly rather than a published Meith base image:
# Coolify (or a plain `docker build`) builds this from this repository, so
# there is no registry account, no image tag to paste anywhere, and no
# `.github/workflows/build.yml` run to wait on. The cost of that zero setup
# is that this installs the board's full dependency closure itself (see the
# `npm install` below), so a build here is heavier than `Dockerfile.prebuilt`'s
# thin delta — that image, pulled rather than built, is the trade the advanced
# path takes for a low-spec build server or a faster deploy (see `README.md`
# and, in the meith repository, docs/operations/docker-compose.md,
# "Custom boards").
#
# Two stages, not three: unlike the official image, this does not prune down
# to Next's own standalone output. The migrate role below runs `meith
# migrate`, and `meith` materializes @meith/cli's sources and runs them
# with tsx at the moment it runs (see the meith repository's
# docs/contributing/development.md, "Consuming the board from a workspace") — it needs
# the full, un-pruned node_modules tree this board installed, not what Next
# traced as reachable from the web server alone. The tick itself is driven
# by docker-compose.yaml's own `worker` service — a lightweight loop against
# /api/system/tick, not a compiled worker process, because @meith/worker is
# not published (see the meith repository's docs/contributing/release.md).
FROM node:26-alpine@sha256:aadf416b2cdce311a8811ba3f0608a61b77dbf997500e2eafe781b51f6a0b019 AS deps
WORKDIR /board

# This board's own manifest, cached independently of its source — editing
# meith.config.ts should not re-run npm install. Nothing warms node_modules
# ahead of this the way `Dockerfile.prebuilt`'s base image does: the full
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
# what DATABASE_URL an operator supplies to `docker run`.
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
# and prunes, and the postgres client tools `meith backup` and the panel's
# backups dump with. The compose file mounts the persistent "backups" volume
# over this path.
RUN apk add --no-cache postgresql18-client
ENV BACKUP_DIR=/backups
RUN mkdir -p /backups && chown node:node /backups

# `meith <command>` on PATH runs this board's own operator CLI — the same one
# node_modules/.bin/meith is — so a Coolify terminal or `docker compose exec web
# meith ...` needs no path. It cd's to /board so the CLI finds this board's
# config, and overrides any wrapper an inherited base image installed, which
# would target the board that image was built from, not this one.
RUN printf '#!/bin/sh\ncd /board\nexec node_modules/.bin/meith "$@"\n' > /usr/local/bin/meith \
  && chmod +x /usr/local/bin/meith

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

mkdir -p "$(dirname -- "$BOARD_NAME/Dockerfile.prebuilt")"
cat > "$BOARD_NAME/Dockerfile.prebuilt" <<'MEITH_SCAFFOLD_EOF'
# syntax=docker/dockerfile:1.7-labs
# check=skip=InvalidDefaultArgInFrom
# __MEITH_BOARD_NAME__'s advanced deploy image — built by `.github/workflows/build.yml` and
# pulled by `docker-compose.prebuilt.yaml`. A quick-start board never builds
# this file directly; it can delete this file, `docker-compose.prebuilt.yaml`
# and `.github/workflows/build.yml` outright and keep only `Dockerfile` and
# `docker-compose.yaml` (see README.md, "Deploy").
#
# FROM the published framework base image — deps + framework layers only,
# locked to this exact release (see the meith repository's
# docs/operations/docker-compose.md, "Custom boards", and docker/Dockerfile.base for what
# it is and is not). This board's own Dockerfile only ever installs its own
# delta on top of it — a new plugin's own dependency, typically nothing more
# — which is what keeps a rebuild after `npm install some-plugin` a matter
# of minutes rather than a cold toolchain build.
#
# Two stages, not three: unlike the official image, this does not prune down
# to Next's own standalone output. The migrate role below runs `meith
# migrate`, and `meith` materializes @meith/cli's sources and runs them
# with tsx at the moment it runs (see the meith repository's
# docs/contributing/development.md, "Consuming the board from a workspace") — it needs
# the full, un-pruned node_modules tree this board installed, not what Next
# traced as reachable from the web server alone. The tick itself is driven
# by docker-compose.yaml's own `worker` service — a lightweight loop against
# /api/system/tick, not a compiled worker process, because @meith/worker is
# not published (see the meith repository's docs/contributing/release.md).
ARG MEITH_VERSION
FROM ghcr.io/meith-dev/meith-base:${MEITH_VERSION} AS deps
WORKDIR /board

# This board's own manifest, cached independently of its source — editing
# meith.config.ts should not re-run npm install. The base image above
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

# Uploaded files — avatars, board images, attachments — land here, and the
# compose file mounts the persistent "uploads" volume over this path. Creating
# it in the image, owned by node, is what lets the fresh volume inherit that
# ownership; UPLOADS_DIR gives the board an absolute path so the working
# directory never decides where uploads go. Without both, uploads land on the
# container's own layer and a redeploy discards them.
ENV UPLOADS_DIR=/app/.uploads
RUN mkdir -p /app/.uploads && chown node:node /app/.uploads

# The ring of backup bundles the admin panel's Backups screen writes, lists
# and prunes, and the postgres client tools `meith backup` and the panel's
# backups dump with. The compose file mounts the persistent "backups" volume
# over this path.
RUN apk add --no-cache postgresql18-client
ENV BACKUP_DIR=/backups
RUN mkdir -p /backups && chown node:node /backups

# `meith <command>` on PATH runs this board's own operator CLI — the same one
# node_modules/.bin/meith is — so a Coolify terminal or `docker compose exec web
# meith ...` needs no path. It cd's to /board so the CLI finds this board's
# config, and overrides any wrapper an inherited base image installed, which
# would target the board that image was built from, not this one.
RUN printf '#!/bin/sh\ncd /board\nexec node_modules/.bin/meith "$@"\n' > /usr/local/bin/meith \
  && chmod +x /usr/local/bin/meith

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
# published, so nothing here can run it — docker-compose.yaml's own `worker`
# service drives the tick a different way, calling this image's web role
# over HTTP instead of running as a role of this image.
set -e

# An explicit command wins over the role, the same as the official image —
# `docker compose run --rm web meith --help` (or `exec` into the running
# container) should run the CLI rather than silently starting the web server.
if [ "$#" -gt 0 ]; then
  exec "$@"
fi

case "${MEITH_ROLE:-web}" in
  migrate)
    # Runs to completion and exits; compose's one-shot service waits on it.
    exec node_modules/.bin/meith migrate
    ;;
  web)
    exec node_modules/.bin/forum-web start
    ;;
  *)
    echo "Unknown MEITH_ROLE: ${MEITH_ROLE}. Expected 'web' or 'migrate'." >&2
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

if [ "${MEITH_ROLE:-web}" = "migrate" ]; then
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
# The advanced/prebuilt path (see README.md, "Deploy"). Builds this board's
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
          docker build -f Dockerfile.prebuilt --build-arg MEITH_VERSION="$MEITH_VERSION" -t "$IMAGE:${{ github.sha }}" -t "$IMAGE:latest" .
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
            echo "Either of these goes in the MEITH_IMAGE variable on the Coolify"
            echo "resource:"
            echo
            echo "    $IMAGE:${{ github.sha }}"
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
MEITH_SCAFFOLD_EOF

mkdir -p "$(dirname -- "$BOARD_NAME/docker-compose.yaml")"
cat > "$BOARD_NAME/docker-compose.yaml" <<'MEITH_SCAFFOLD_EOF'
# __MEITH_BOARD_NAME__, quick-start deployed by Coolify — the same shape as the meith
# repository's own docker/compose.coolify.yml: db, migrate, web, worker. See
# README.md for the deploy story this file is the last step of.
#
# Coolify builds `Dockerfile` from this repository itself, so there is no
# MEITH_IMAGE to set here — every deploy is a build from source. For a
# low-spec build server or a faster deploy, use `docker-compose.prebuilt.yaml`
# instead, which pulls the image `.github/workflows/build.yml` pushes to GHCR.
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
    build: .
    image: __MEITH_BOARD_NAME__
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
      BACKUP_S3_BUCKET: ${BACKUP_S3_BUCKET:-}
      BACKUP_S3_REGION: ${BACKUP_S3_REGION:-}
      BACKUP_S3_ACCESS_KEY_ID: ${BACKUP_S3_ACCESS_KEY_ID:-}
      BACKUP_S3_SECRET_ACCESS_KEY: ${BACKUP_S3_SECRET_ACCESS_KEY:-}
      BACKUP_S3_ENDPOINT: ${BACKUP_S3_ENDPOINT:-}
      BACKUP_S3_PREFIX: ${BACKUP_S3_PREFIX:-}
      BACKUP_WEBDAV_URL: ${BACKUP_WEBDAV_URL:-}
      BACKUP_WEBDAV_USERNAME: ${BACKUP_WEBDAV_USERNAME:-}
      BACKUP_WEBDAV_PASSWORD: ${BACKUP_WEBDAV_PASSWORD:-}
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
    image: __MEITH_BOARD_NAME__
    restart: unless-stopped
    mem_limit: ${WEB_MEM_LIMIT:-1g}
    cpus: ${WEB_CPUS:-2}
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
      - MAIL_DRIVER=${MAIL_DRIVER:-log}
      - MAIL_SMTP_HOST=${MAIL_SMTP_HOST:-}
      - MAIL_SMTP_PORT=${MAIL_SMTP_PORT:-}
      - MAIL_SMTP_SECURITY=${MAIL_SMTP_SECURITY:-}
      - MAIL_SMTP_USERNAME=${MAIL_SMTP_USERNAME:-}
      - MAIL_SMTP_PASSWORD=${MAIL_SMTP_PASSWORD:-}
      - MAIL_FROM=${MAIL_FROM:-}
      # The off-site backup destination, unset until the four required values
      # are filled in on the Coolify resource. Coolify only hands a compose
      # service the variables the file names, so a Scheduled Task running
      # `meith backup` in this container would never see them without these
      # lines — see the meith repository's
      # docs/operations/coolify.md, "Set up backups".
      - BACKUP_S3_BUCKET=${BACKUP_S3_BUCKET:-}
      - BACKUP_S3_REGION=${BACKUP_S3_REGION:-}
      - BACKUP_S3_ACCESS_KEY_ID=${BACKUP_S3_ACCESS_KEY_ID:-}
      - BACKUP_S3_SECRET_ACCESS_KEY=${BACKUP_S3_SECRET_ACCESS_KEY:-}
      - BACKUP_S3_ENDPOINT=${BACKUP_S3_ENDPOINT:-}
      - BACKUP_S3_PREFIX=${BACKUP_S3_PREFIX:-}
      - BACKUP_WEBDAV_URL=${BACKUP_WEBDAV_URL:-}
      - BACKUP_WEBDAV_USERNAME=${BACKUP_WEBDAV_USERNAME:-}
      - BACKUP_WEBDAV_PASSWORD=${BACKUP_WEBDAV_PASSWORD:-}
    volumes:
      - uploads:/app/.uploads
      # The ring of backup bundles: what the admin panel's Backups screen
      # writes, lists and downloads, and what `meith backup --dir /backups`
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
  backups:
MEITH_SCAFFOLD_EOF

mkdir -p "$(dirname -- "$BOARD_NAME/docker-compose.prebuilt.yaml")"
cat > "$BOARD_NAME/docker-compose.prebuilt.yaml" <<'MEITH_SCAFFOLD_EOF'
# __MEITH_BOARD_NAME__, deployed by Coolify from a prebuilt image — the advanced path: point
# Coolify's compose-file at this file instead of docker-compose.yaml once
# `.github/workflows/build.yml` has pushed an image, and set MEITH_IMAGE to
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
    # Pull the tag on every deploy. Compose keeps an image it already has, so
    # a rebuilt `:latest` is otherwise never fetched and a redeploy quietly
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
      BACKUP_S3_BUCKET: ${BACKUP_S3_BUCKET:-}
      BACKUP_S3_REGION: ${BACKUP_S3_REGION:-}
      BACKUP_S3_ACCESS_KEY_ID: ${BACKUP_S3_ACCESS_KEY_ID:-}
      BACKUP_S3_SECRET_ACCESS_KEY: ${BACKUP_S3_SECRET_ACCESS_KEY:-}
      BACKUP_S3_ENDPOINT: ${BACKUP_S3_ENDPOINT:-}
      BACKUP_S3_PREFIX: ${BACKUP_S3_PREFIX:-}
      BACKUP_WEBDAV_URL: ${BACKUP_WEBDAV_URL:-}
      BACKUP_WEBDAV_USERNAME: ${BACKUP_WEBDAV_USERNAME:-}
      BACKUP_WEBDAV_PASSWORD: ${BACKUP_WEBDAV_PASSWORD:-}
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
    image: ${MEITH_IMAGE:?set this to the image the build workflow's Summary just printed, e.g. ghcr.io/<you>/__MEITH_BOARD_NAME__:latest}
    pull_policy: always
    restart: unless-stopped
    mem_limit: ${WEB_MEM_LIMIT:-1g}
    cpus: ${WEB_CPUS:-2}
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
      - MAIL_DRIVER=${MAIL_DRIVER:-log}
      - MAIL_SMTP_HOST=${MAIL_SMTP_HOST:-}
      - MAIL_SMTP_PORT=${MAIL_SMTP_PORT:-}
      - MAIL_SMTP_SECURITY=${MAIL_SMTP_SECURITY:-}
      - MAIL_SMTP_USERNAME=${MAIL_SMTP_USERNAME:-}
      - MAIL_SMTP_PASSWORD=${MAIL_SMTP_PASSWORD:-}
      - MAIL_FROM=${MAIL_FROM:-}
      # The off-site backup destination, unset until the four required values
      # are filled in on the Coolify resource. Coolify only hands a compose
      # service the variables the file names, so a Scheduled Task running
      # `meith backup` in this container would never see them without these
      # lines — see the meith repository's
      # docs/operations/coolify.md, "Set up backups".
      - BACKUP_S3_BUCKET=${BACKUP_S3_BUCKET:-}
      - BACKUP_S3_REGION=${BACKUP_S3_REGION:-}
      - BACKUP_S3_ACCESS_KEY_ID=${BACKUP_S3_ACCESS_KEY_ID:-}
      - BACKUP_S3_SECRET_ACCESS_KEY=${BACKUP_S3_SECRET_ACCESS_KEY:-}
      - BACKUP_S3_ENDPOINT=${BACKUP_S3_ENDPOINT:-}
      - BACKUP_S3_PREFIX=${BACKUP_S3_PREFIX:-}
      - BACKUP_WEBDAV_URL=${BACKUP_WEBDAV_URL:-}
      - BACKUP_WEBDAV_USERNAME=${BACKUP_WEBDAV_USERNAME:-}
      - BACKUP_WEBDAV_PASSWORD=${BACKUP_WEBDAV_PASSWORD:-}
    volumes:
      - uploads:/app/.uploads
      # The ring of backup bundles: what the admin panel's Backups screen
      # writes, lists and downloads, and what `meith backup --dir /backups`
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
  backups:
MEITH_SCAFFOLD_EOF

mkdir -p "$(dirname -- "$BOARD_NAME/docker-compose.byhand.yaml")"
cat > "$BOARD_NAME/docker-compose.byhand.yaml" <<'MEITH_SCAFFOLD_EOF'
# __MEITH_BOARD_NAME__, deployed by Docker Compose without a panel — your own `.env`,
# your own reverse proxy, no Coolify. The same four services as
# docker-compose.yaml and docker-compose.prebuilt.yaml above it (db,
# migrate, web, worker), reshaped for a machine with nothing generating
# secrets for you: every value Coolify would have filled in — the database
# password, AUTH_SECRET, TICK_SECRET, the board's own address — comes from
# a `.env` beside this file instead. See the meith repository's
# docs/operations/docker-compose.md, which this file is
# the last step of.
#
# `docker compose` only auto-discovers a file literally named
# docker-compose.yaml, and that name is already spoken for — Coolify's own
# zero-configuration default. Put `COMPOSE_FILE=docker-compose.byhand.yaml`
# in `.env` once, and every plain `docker compose ...` command reads this
# file without a `-f`, including the ones the rest of this project's
# documentation already shows you.
#
# `docker compose up -d --build` builds `Dockerfile` from this repository,
# on this machine — the same trade the quick-start path above takes. For a
# low-spec server, build `Dockerfile.prebuilt` somewhere else instead (push
# to GitHub and let `.github/workflows/build.yml` do it, or run
# `docker build -f Dockerfile.prebuilt ...` by hand) and change the two
# `build: .` lines below to `image: <that image>:<version>` — the
# substitution docs/operations/docker-compose.md, "Building
# somewhere else", walks through.
services:
  postgres:
    image: postgres:18-alpine@sha256:d3e1620b530c944afa6e887d22eb899824da68e19c52024bf98f5220c88a65b2
    restart: unless-stopped
    mem_limit: ${POSTGRES_MEM_LIMIT:-1g}
    cpus: ${POSTGRES_CPUS:-1}
    logging:
      driver: json-file
      options:
        max-size: 10m
        max-file: '3'
    environment:
      POSTGRES_USER: community
      # Generate with `openssl rand -hex 32`, not base64 — this value is
      # substituted into the postgres:// URL below, and base64's alphabet
      # includes `/` and `+`, which make the connection string unparseable.
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-community}
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
    image: __MEITH_BOARD_NAME__
    environment:
      MEITH_ROLE: migrate
      DATABASE_URL: postgres://community:${POSTGRES_PASSWORD:-community}@postgres:5432/community
      AUTH_SECRET: ${AUTH_SECRET:?AUTH_SECRET must be set}
      TICK_SECRET: ${TICK_SECRET:?TICK_SECRET must be set}
      FILESTORE_DRIVER: local
      # So that "back up before migrating" (a board setting) can ship the
      # bundle it takes to the same off-site destination web uses.
      BACKUP_S3_BUCKET: ${BACKUP_S3_BUCKET:-}
      BACKUP_S3_REGION: ${BACKUP_S3_REGION:-}
      BACKUP_S3_ACCESS_KEY_ID: ${BACKUP_S3_ACCESS_KEY_ID:-}
      BACKUP_S3_SECRET_ACCESS_KEY: ${BACKUP_S3_SECRET_ACCESS_KEY:-}
      BACKUP_S3_ENDPOINT: ${BACKUP_S3_ENDPOINT:-}
      BACKUP_S3_PREFIX: ${BACKUP_S3_PREFIX:-}
      BACKUP_WEBDAV_URL: ${BACKUP_WEBDAV_URL:-}
      BACKUP_WEBDAV_USERNAME: ${BACKUP_WEBDAV_USERNAME:-}
      BACKUP_WEBDAV_PASSWORD: ${BACKUP_WEBDAV_PASSWORD:-}
    volumes:
      - uploads:/app/.uploads
      - backups:/backups
    depends_on:
      postgres:
        condition: service_healthy
    restart: 'no'

  web:
    build: .
    image: __MEITH_BOARD_NAME__
    restart: unless-stopped
    mem_limit: ${WEB_MEM_LIMIT:-1g}
    cpus: ${WEB_CPUS:-2}
    logging:
      driver: json-file
      options:
        max-size: 10m
        max-file: '3'
    ports:
      - '${PORT:-127.0.0.1:3000}:3000'
    environment:
      DATABASE_URL: postgres://community:${POSTGRES_PASSWORD:-community}@postgres:5432/community
      AUTH_SECRET: ${AUTH_SECRET:?AUTH_SECRET must be set}
      TICK_SECRET: ${TICK_SECRET:?TICK_SECRET must be set}
      QUEUE_DRIVER: postgres
      CACHE_DRIVER: ${CACHE_DRIVER:-next}
      REDIS_URL: ${REDIS_URL:-}
      FILESTORE_DRIVER: local
      APP_URL: ${APP_URL:-http://localhost:3000}
      # One reverse proxy (Caddy, in the guide's own walkthrough) sits in
      # front of `web` — see "Count your proxies" in
      # docs/operations/docker-compose.md.
      TRUSTED_PROXY_HOPS: ${TRUSTED_PROXY_HOPS:-1}
      # Leaving this at `log` does not mean no mail: it means the board
      # decides, from the installer on first run or from
      # /admin/settings?group=mail afterwards, with no redeploy. Setting it
      # here makes this file authoritative instead.
      MAIL_DRIVER: ${MAIL_DRIVER:-log}
      MAIL_FROM: ${MAIL_FROM:-}
      MAIL_HTTP_ENDPOINT: ${MAIL_HTTP_ENDPOINT:-}
      MAIL_HTTP_TOKEN: ${MAIL_HTTP_TOKEN:-}
      MAIL_SMTP_HOST: ${MAIL_SMTP_HOST:-}
      MAIL_SMTP_PORT: ${MAIL_SMTP_PORT:-}
      MAIL_SMTP_SECURITY: ${MAIL_SMTP_SECURITY:-}
      MAIL_SMTP_USERNAME: ${MAIL_SMTP_USERNAME:-}
      MAIL_SMTP_PASSWORD: ${MAIL_SMTP_PASSWORD:-}
      BACKUP_S3_BUCKET: ${BACKUP_S3_BUCKET:-}
      BACKUP_S3_REGION: ${BACKUP_S3_REGION:-}
      BACKUP_S3_ACCESS_KEY_ID: ${BACKUP_S3_ACCESS_KEY_ID:-}
      BACKUP_S3_SECRET_ACCESS_KEY: ${BACKUP_S3_SECRET_ACCESS_KEY:-}
      BACKUP_S3_ENDPOINT: ${BACKUP_S3_ENDPOINT:-}
      BACKUP_S3_PREFIX: ${BACKUP_S3_PREFIX:-}
      BACKUP_WEBDAV_URL: ${BACKUP_WEBDAV_URL:-}
      BACKUP_WEBDAV_USERNAME: ${BACKUP_WEBDAV_USERNAME:-}
      BACKUP_WEBDAV_PASSWORD: ${BACKUP_WEBDAV_PASSWORD:-}
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
    mem_limit: ${WORKER_MEM_LIMIT:-64m}
    cpus: ${WORKER_CPUS:-0.25}
    logging:
      driver: json-file
      options:
        max-size: 10m
        max-file: '3'
    environment:
      TICK_SECRET: ${TICK_SECRET:?TICK_SECRET must be set}
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

  # Off by default — see docs/operations/scaling.md before setting
  # CACHE_DRIVER=redis above. This is the server it needs.
  redis:
    profiles: ['redis']
    image: valkey/valkey:9-alpine@sha256:a174b894902bd3367e330d47cc2054367dc4917701776aaf336f41d83b65ec7a
    restart: unless-stopped
    mem_limit: ${REDIS_MEM_LIMIT:-256m}
    cpus: ${REDIS_CPUS:-0.5}
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
MEITH_SCAFFOLD_EOF

mkdir -p "$(dirname -- "$BOARD_NAME/README.md")"
cat > "$BOARD_NAME/README.md" <<'MEITH_SCAFFOLD_EOF'
# __MEITH_BOARD_NAME__

A community board built on [Meith](https://github.com/meith-dev/meith).

## Choose a deployment

| Route | File | Where the image builds |
|---|---|---|
| Quick start with Coolify | `docker-compose.yaml` | Your server |
| Advanced / prebuilt | `docker-compose.prebuilt.yaml` | GitHub Actions or another build machine |
| Docker Compose without a panel | `docker-compose.byhand.yaml` | Your server |

Use one route for a deployment. The [Coolify guide](https://github.com/meith-dev/meith/blob/main/docs/operations/coolify.md) and [Docker Compose guide](https://github.com/meith-dev/meith/blob/main/docs/operations/docker-compose.md) cover prerequisites, secrets, domains and recovery.

### Quick start with Coolify

1. Push this repository to GitHub.
2. Create a Git repository resource in Coolify with the Docker Compose build pack and `/docker-compose.yaml` as the Compose file.
3. Assign the board's domain and deploy. Coolify supplies database and authentication secrets; save a protected recovery copy.
4. Confirm `postgres` is healthy, `migrate` exits successfully, and `web` and `worker` run.
5. Open `/install`, unlock with `AUTH_SECRET`, and create the board and its first administrator. The installer seals itself and returns 404 after completion.

A push alone does not rebuild this route. Use Coolify's **Redeploy** after pushing. If the server cannot complete the build, use the prebuilt route.

### Advanced / prebuilt

1. Let `.github/workflows/build.yml` finish in GitHub Actions. It builds and publishes your board's image.
2. Make that image accessible to Coolify and select `/docker-compose.prebuilt.yaml`.
3. Set `MEITH_IMAGE` to the exact image from the workflow summary. The commit tag uses `${{ github.sha }}`; `:latest` follows later builds and can change on redeploy.
4. Deploy and complete `/install` as above.

For a local image build, the build argument comes from the board's pinned package:

```sh
docker build -f Dockerfile.prebuilt --build-arg MEITH_VERSION=$(node -p "require('./package.json').dependencies['@meith/web']") -t __MEITH_BOARD_NAME__ .
```

After changing the board, wait for its new image and update `MEITH_IMAGE` if pinned to a commit, then redeploy.

## Run locally

```sh
npm install
npm run dev
```

Open `http://localhost:3000`. Without `DATABASE_URL`, this is a read-only fixture preview. For persistent registration and posting, follow [Create a writable local board](https://github.com/meith-dev/meith/blob/main/docs/operations/local-board.md).

## Configure the community

- `meith.config.ts` registers themes and board configuration.
- `board.plugins.json` and `meith.plugins.ts` register installed plugins.
- `/admin` manages forums, members, permissions and settings.
- `npm run meith -- --help` lists operator commands.

Before inviting members, [test email delivery](https://github.com/meith-dev/meith/blob/main/docs/operations/mail.md), verify [scheduled work](https://github.com/meith-dev/meith/blob/main/docs/operations/scheduled-tasks.md), and [configure backups](https://github.com/meith-dev/meith/blob/main/docs/operations/backups.md). The log mail driver delivers nothing. This deployment's worker calls the web application's tick endpoint. For a manual development run, use `npm run meith -- task:run`.

## Install an extension

Add a plugin from this checkout:

```sh
npm run meith -- plugin:add @meith/plugin-dues
```

Commit the package and registry changes, build and deploy, then apply plugin migrations with `meith upgrade` against the deployed board. Follow [Install plugins and themes](https://github.com/meith-dev/meith/blob/main/docs/operations/installing.md) for the full procedure and theme registration. Installing a package into a running container does not make it part of the next deployment.

## Upgrading

`.github/workflows/update.yml` checks weekly and opens an update pull request. It also supports **Run workflow**. Enable **Allow GitHub Actions to create and approve pull requests** under **Settings → Actions → General**.

Review the release notes, take a backup, and inspect any scaffold files the updater left for manual reconciliation. Merge, rebuild and redeploy; then run `meith upgrade` for plugin migrations. Core migrations run through the deployment's migration service. Migrations are forward-only; recovery uses a backup.

To prepare the update locally:

```sh
npx create-meith@latest update
```

The updater moves package pins and supported deployment files together. Its package update includes these commands; running them alone does not update deployment files:

```sh
npm install --save-exact @meith/web@latest @meith/cli@latest @meith/theme-default@latest
npm install --save-exact next@$(node -p "require('./node_modules/@meith/web/package.json').dependencies.next")
```

Keep Next.js aligned with `@meith/web`. Use `--save-exact`: a caret range is not a legal Docker image tag. Read [Upgrade Meith](https://github.com/meith-dev/meith/blob/main/docs/operations/upgrading.md) before applying the change.
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

echo "Created $BOARD_NAME — 19 files."
echo
echo "  cd $BOARD_NAME"
echo "  npm install"
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
echo "meith task:run. Without it nothing catches up, and nothing errors."
