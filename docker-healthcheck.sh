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
#  - **web**: the board answers on its own port *and* can reach its database,
#    which is what `/api/health` reports. A server that bound the port and
#    cannot serve is not healthy, and saying otherwise would let a deploy swap
#    to it.
#  - **worker**: the scheduler process is alive. There is nothing to fetch, and
#    "the process a container exists to run is running" is the honest question.
#  - **migrate**: healthy while it lasts. The container runs to completion and
#    exits; its *exit code* is the verdict, and a health probe has no opinion.
set -e

case "${FORUM_ROLE:-web}" in
  worker)
    pgrep -f 'apps/worker/worker.cjs' >/dev/null
    ;;
  migrate)
    exit 0
    ;;
  *)
    node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
    ;;
esac
