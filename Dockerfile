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
COPY apps/forum/package.json                 apps/forum/
COPY apps/cli/package.json                   apps/cli/
COPY packages/accounts/package.json          packages/accounts/
COPY packages/authorization/package.json     packages/authorization/
COPY packages/core/package.json              packages/core/
COPY packages/db/package.json                packages/db/
COPY packages/drivers/package.json           packages/drivers/
COPY packages/events/package.json            packages/events/
COPY packages/forums/package.json            packages/forums/
COPY packages/groups/package.json            packages/groups/
COPY packages/posts/package.json             packages/posts/
COPY packages/settings/package.json          packages/settings/
COPY packages/shared/package.json            packages/shared/
COPY packages/tasks/package.json             packages/tasks/
COPY packages/testkit/package.json           packages/testkit/
COPY packages/theme-kit/package.json         packages/theme-kit/
COPY packages/threads/package.json           packages/threads/
COPY packages/ui/package.json                packages/ui/
COPY themes/default/package.json             themes/default/

RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# build: compile the Next standalone bundle.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable

COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/forum/node_modules ./apps/forum/node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# The build must require neither a database nor any production secret: no
# placeholder AUTH_SECRET is baked into this layer. F02's production rules stand
# down for the build phase (see NEXT_PHASE in packages/core/src/env.ts) and are
# enforced unconditionally when the server boots, in the runtime stage.
ENV DATA_SOURCE=fixture

RUN pnpm --filter @forum/web build

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

CMD ["node", "apps/forum/server.js"]
