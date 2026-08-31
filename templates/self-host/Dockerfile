# syntax=docker/dockerfile:1.7-labs
# check=skip=InvalidDefaultArgInFrom
# meith-board's quick-start deploy image — built from source, with nothing to
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
# and, in the meith repository, docs/getting-started/deployment/docker-compose.md,
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
