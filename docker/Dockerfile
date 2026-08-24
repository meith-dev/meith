# syntax=docker/dockerfile:1.7-labs
# F04 — self-hosting image.
#
# Multi-stage so the runtime layer carries only the standalone server output, not
# pnpm, the TypeScript sources, or the dev dependency tree.

# ---------------------------------------------------------------------------
# deps: install with the lockfile, cached independently of source changes.
# ---------------------------------------------------------------------------
FROM node:26-alpine@sha256:aadf416b2cdce311a8811ba3f0608a61b77dbf997500e2eafe781b51f6a0b019 AS deps
WORKDIR /repo

# Node no longer bundles Corepack — install it before enabling it.
RUN npm install -g corepack@latest && corepack enable

# Only the manifests are copied first, so editing a .ts file does not invalidate
# the (slow) install layer.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# Every workspace manifest, by pattern rather than by hand.
#
# This was seventeen COPY lines naming each package, and it rotted exactly the
# way a hand-maintained list of everything does: `packages/bbcode` (F36) and
# `packages/moderation` (F48) were both missing, so `pnpm install
# --frozen-lockfile` failed against a lockfile describing workspaces the image
# could not see. Nothing caught it because no CI job had ever run `docker build`
# — which is the other half of what F04 asks for and is now the `image` job.
#
# `--parents` keeps the directory structure, so this stays the cheap
# manifests-only layer it was written to be.
COPY --parents ./*/*/package.json ./

# MEI-76: `boards/stock` depends on `@meith/web` and `@meith/cli` as real
# `workspace:*` dependencies (not path aliases), and both declare a `bin`
# (`forum-web`, `community`) pnpm must link into `boards/stock/node_modules/
# .bin`. pnpm reads the target file to do that, so — same as the package.json
# line above — the actual bin scripts have to exist at install time, not just
# their package.json entries. Without this, install only warns (`Failed to
# create bin ... ENOENT`) and silently skips the symlink, so `forum-web build`
# fails later in the build stage with `forum-web: not found`, once the actual
# source is present but nothing re-runs install to fix the now-missing links.
COPY --parents ./*/*/bin/*.mjs ./

RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# build: compile the Next standalone bundle.
# ---------------------------------------------------------------------------
# Built *from* the deps stage rather than copying node_modules out of it.
#
# pnpm gives every workspace its own `node_modules` of symlinks into the store,
# so `packages/drivers/node_modules/@aws-sdk/...` is a real directory that has
# to exist. This stage copied only the root and `apps/community` trees, and the
# build worked anyway because there was no .dockerignore and `COPY . .` was
# dragging the *host's* node_modules in behind it. Adding a .dockerignore
# exposed that: 53 unresolved modules, starting with @aws-sdk/client-s3.
#
# Inheriting the stage keeps every workspace's links intact by construction, so
# this cannot rot the same way again.
FROM deps AS build
WORKDIR /repo

COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# The build must require neither a database nor any production secret: no
# placeholder AUTH_SECRET is baked into this layer. F02's production rules stand
# down for the build phase (see NEXT_PHASE in packages/core/src/env.ts) and are
# enforced unconditionally when the server boots, in the runtime stage.
ENV DATA_SOURCE=fixture

# MEI-76: built through `boards/stock` — the same create-meith-shaped
# workspace shape a custom board has (docs/architecture.md, "The board-config
# seam") — via `forum-web build`, rather than `pnpm --filter @meith/web build`
# against apps/community directly. Graduating from the official image to a
# custom board is then a source swap, not a migration.
#
# `boards/stock`'s own `build` script already sets FORUM_WORKSPACE_ROOT and
# FORUM_ALIASES_FROM (see apps/community/bin/forum-web.mjs and
# apps/community/next.config.mjs) — this workspace's pnpm install does not
# hoist `node_modules`, unlike the real external boards this mechanism was
# built for, so the materialized app needs those two pointed explicitly at
# this repository's own root and its own tsconfig path aliases. Both are
# no-ops for every other consumer of forum-web.
RUN pnpm --filter @meith/board-stock build
# Bundled separately from the Next output; see the COPY below for why.
RUN pnpm --filter @meith/worker build
# The operator CLI, for the same reason and by the same means. A self-hosted
# board is the deployment *least* able to reach for a checkout — the image is
# all there is on that machine — and "everything you should not need a browser
# for" is worth nothing if promoting a user needs the repository and a
# toolchain.
RUN pnpm --filter @meith/cli build

# ---------------------------------------------------------------------------
# runtime: standalone output only.
# ---------------------------------------------------------------------------
FROM node:26-alpine@sha256:aadf416b2cdce311a8811ba3f0608a61b77dbf997500e2eafe781b51f6a0b019 AS runtime
WORKDIR /app

# Stamped by the release workflow (see docs/release.md); a local build leaves
# both at defaults, so 0.0.0-dev in a log means "built from a checkout".
ARG MEITH_VERSION=0.0.0-dev
ARG MEITH_COMMIT=unknown
ENV MEITH_VERSION=$MEITH_VERSION
ENV MEITH_COMMIT=$MEITH_COMMIT
LABEL org.opencontainers.image.title="Meith" \
      org.opencontainers.image.description="Community software for people who want to build something together." \
      org.opencontainers.image.url="https://meith.dev" \
      org.opencontainers.image.source="https://github.com/meith-dev/meith" \
      org.opencontainers.image.version=$MEITH_VERSION \
      org.opencontainers.image.revision=$MEITH_COMMIT \
      org.opencontainers.image.licenses="LGPL-3.0-or-later"

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN apk add --no-cache postgresql18-client

# Non-root: the server needs no write access to its own code, and a container
# escape should not land on uid 0.
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# `standalone` already contains a pruned node_modules with only what the server
# traced as reachable, which is why nothing is installed in this stage.
#
# The traced tree's own app directory is `boards/stock/.meith/app`, not
# `apps/community`: `forum-web build` materializes apps/community's sources
# there (see apps/community/bin/forum-web.mjs), and the standalone output
# mirrors that path relative to the traced root — a relative path Next bakes
# into server.js's own `require()` calls at build time, so it cannot be
# renamed on the way in. `.next/static` and `public` (still read from
# apps/community's own source — that directory is unaffected by where the
# build ran) each have to land at that same nested path, alongside server.js,
# for the same reason.
COPY --from=build --chown=nextjs:nodejs /repo/boards/stock/.meith/app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /repo/boards/stock/.meith/app/.next/static ./boards/stock/.meith/app/.next/static
COPY --from=build --chown=nextjs:nodejs /repo/apps/community/public ./boards/stock/.meith/app/public

# F04's other half: the same image runs the worker.
#
# The worker cannot ride along in `.next/standalone` — that output contains only
# what Next traced as reachable from the app — so it is bundled separately into
# a single file with no node_modules to install beside it. One image, two roles,
# and the role is a flag rather than a second Dockerfile.
COPY --from=build --chown=nextjs:nodejs /repo/apps/worker/dist/ ./apps/worker/
# `docker compose run --rm web node apps/cli/cli.cjs …`. The entrypoint hands an
# explicit command straight through, so no role is needed for a program that
# takes arguments and exits.
COPY --from=build --chown=nextjs:nodejs /repo/apps/cli/dist/ ./apps/cli/

# docs/operating.md documents every operator command as `community <cmd>` —
# and until this line, nothing in this image put a `community` binary on
# PATH to make that real (this is a runtime-only stage with no `pnpm
# install`, so no bin symlink is ever created here). CI's own working
# invocation was the giveaway: `node apps/cli/cli.cjs`, not `community`. A
# one-line wrapper makes the documented command the actual one, for every
# operator command this image has ever shipped — not just MEI-81's new
# `board:eject`.
RUN printf '#!/bin/sh\nexec node /app/apps/cli/cli.cjs "$@"\n' > /usr/local/bin/community \
  && chmod +x /usr/local/bin/community
# The generated SQL. Not part of the traced standalone output — it is data, not
# a module — so the migrate role would find an empty folder without this.
COPY --from=build --chown=nextjs:nodejs /repo/packages/db/migrations ./migrations
# MEI-81: `community board:eject` reads this to write the manifest a graduated
# board starts with — the plugins this exact build actually compiled in, not
# an assumption. `BOARD_PLUGINS_MANIFEST` names it explicitly because a
# bundled `dist/cli.cjs` does not sit the same distance from the repository
# root that `apps/cli/src/*.ts` does (the COPY two lines up drops the `dist`
# segment) — see apps/cli/src/board-eject.ts for the fallback that distance
# would otherwise wrongly compute.
COPY --from=build --chown=nextjs:nodejs /repo/boards/stock/board.plugins.json ./board.plugins.json
ENV BOARD_PLUGINS_MANIFEST=/app/board.plugins.json
COPY --chown=nextjs:nodejs docker/entrypoint.sh ./entrypoint.sh
COPY --chown=nextjs:nodejs docker/healthcheck.sh ./healthcheck.sh

# FILESTORE_DRIVER=local writes here. Declared as a volume so uploads survive a
# container replacement — without this, every redeploy silently loses avatars.
RUN mkdir -p /app/.uploads && chown nextjs:nodejs /app/.uploads
VOLUME ["/app/.uploads"]
ENV UPLOADS_DIR=/app/.uploads

USER nextjs
EXPOSE 3000

# Hits a real route rather than just checking the port is bound, so a server that
# booted but cannot render is reported unhealthy — and asks a different question
# of a worker, which serves no HTTP and reported unhealthy for its whole life
# under the single check this replaced. See docker/healthcheck.sh.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["/app/healthcheck.sh"]

# COMMUNITY_ROLE picks which of the three programs in this image starts: `worker`
# runs the scheduler loop, `migrate` applies the schema and exits, and unset —
# the default — runs the web server, so existing deployments keep working
# without setting anything. An unrecognised value exits rather than quietly
# serving the board, because a typo that started a *fourth* web server beside
# the real one is the failure that mode would hide. See docker/entrypoint.sh.
ENTRYPOINT ["./entrypoint.sh"]
