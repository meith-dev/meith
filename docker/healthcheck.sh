#!/bin/sh
# What "healthy" means depends on which role this container is running.
#
# The image used to carry one check — fetch `/api/health` — which is right for
# the web server and false for every other role. A worker container answers no
# HTTP at all, so it reported unhealthy from its first probe to its last, which
# is not a cosmetic problem: `docker compose up --wait` never finishes, and an
# operator watching `docker compose ps` sees a board that says it is broken
# while it is working perfectly.
#
# So the check follows the role, and each answer means something:
#
#  - **web**: `/api/ready` reports whether *this board* can do its job — reach
#    the database and keep the scheduler moving — not just whether this
#    process bound the port. `/api/health` still exists for pure liveness; see
#    docs/guides/operations/monitoring.md for why the container healthcheck uses the other one.
#  - **worker**: the scheduler process is alive, and — `--ready`, running the
#    bundled worker binary as a one-shot process instead of its loop — the
#    same database-and-scheduler check `/api/ready` runs also passes.
#  - **migrate**: healthy while it lasts. The container runs to completion and
#    exits; its *exit code* is the verdict, and a health probe has no opinion.
set -e

case "${COMMUNITY_ROLE:-web}" in
  worker)
    pgrep -f 'apps/worker/worker.cjs' >/dev/null && node apps/worker/worker.cjs --ready
    ;;
  migrate)
    exit 0
    ;;
  *)
    node -e "fetch('http://127.0.0.1:3000/api/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
    ;;
esac
