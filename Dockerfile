# syntax=docker/dockerfile:1.7-labs
# F04 — self-hosting image.
#
# Multi-stage so the runtime layer carries only the standalone server output, not
# pnpm, the TypeScript sources, or the dev dependency tree.

# ---------------------------------------------------------------------------
# deps: install with the lockfile, cached independently of source changes.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /repo

RUN corepack enable

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

RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# build: compile the Next standalone bundle.
# ---------------------------------------------------------------------------
# Built *from* the deps stage rather than copying node_modules out of it.
#
# pnpm gives every workspace its own `node_modules` of symlinks into the store,
# so `packages/drivers/node_modules/@aws-sdk/...` is a real directory that has
# to exist. This stage copied only the root and `apps/forum` trees, and the
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

RUN pnpm --filter @forum/web build
# Bundled separately from the Next output; see the COPY below for why.
RUN pnpm --filter @forum/worker build

# ---------------------------------------------------------------------------
# runtime: standalone output only.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Non-root: the server needs no write access to its own code, and a container
# escape should not land on uid 0.
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# `standalone` already contains a pruned node_modules with only what the server
# traced as reachable, which is why nothing is installed in this stage.
COPY --from=build --chown=nextjs:nodejs /repo/apps/forum/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /repo/apps/forum/.next/static ./apps/forum/.next/static
COPY --from=build --chown=nextjs:nodejs /repo/apps/forum/public ./apps/forum/public

# F04's other half: the same image runs the worker.
#
# The worker cannot ride along in `.next/standalone` — that output contains only
# what Next traced as reachable from the app — so it is bundled separately into
# a single file with no node_modules to install beside it. One image, two roles,
# and the role is a flag rather than a second Dockerfile.
COPY --from=build --chown=nextjs:nodejs /repo/apps/worker/dist/ ./apps/worker/
# The generated SQL. Not part of the traced standalone output — it is data, not
# a module — so the migrate role would find an empty folder without this.
COPY --from=build --chown=nextjs:nodejs /repo/packages/db/migrations ./migrations
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./docker-entrypoint.sh

# FILESTORE_DRIVER=local writes here. Declared as a volume so uploads survive a
# container replacement — without this, every redeploy silently loses avatars.
RUN mkdir -p /app/.uploads && chown nextjs:nodejs /app/.uploads
VOLUME ["/app/.uploads"]
ENV UPLOADS_DIR=/app/.uploads

USER nextjs
EXPOSE 3000

# Hits a real route rather than just checking the port is bound, so a server that
# booted but cannot render is reported unhealthy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# FORUM_ROLE=worker runs the scheduler loop instead of the web server. Anything
# else runs the web server, so the default is unchanged and existing deployments
# keep working without setting anything.
ENTRYPOINT ["./docker-entrypoint.sh"]
