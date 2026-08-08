#!/bin/sh
# F04 — one image, three roles.
#
# The web server, the worker and the migrator run the same code from the same
# build; the only difference is which process starts. A flag rather than three
# images means they cannot drift, which is the whole point of the acceptance
# criterion — and it is why a board migrated by the `migrate` service has been
# through the same `runMigrations()` as one migrated by `community migrate`.
set -e

# An explicit command wins over the role. `docker run image node
# node_modules/.bin/drizzle-kit migrate` has to still run the migrator, and
# compose's one-shot `migrate` service depends on exactly that — an entrypoint
# that ignored its arguments would silently start a web server instead, which is
# how this was caught.
if [ "$#" -gt 0 ]; then
  exec "$@"
fi

case "${COMMUNITY_ROLE:-web}" in
  worker)
    exec node apps/worker/worker.cjs
    ;;
  migrate)
    # Runs to completion and exits; compose's one-shot service waits on it.
    exec node apps/worker/migrate.cjs
    ;;
  web)
    exec node apps/community/server.js
    ;;
  *)
    # Every role this file handles, not two of the three. `migrate` is the one
    # `docker-compose.coolify.yml` sets, so a typo in it was answered by a list
    # that did not contain the value the operator was trying to spell.
    echo "Unknown COMMUNITY_ROLE: ${COMMUNITY_ROLE}. Expected 'web', 'worker' or 'migrate'." >&2
    exit 1
    ;;
esac
