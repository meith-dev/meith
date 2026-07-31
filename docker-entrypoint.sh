#!/bin/sh
# F04 — one image, two roles.
#
# The web server and the worker run the same task code from the same build; the
# only difference is which process starts. A flag rather than a second image
# means they cannot drift, which is the whole point of the acceptance criterion.
set -e

# An explicit command wins over the role. `docker run image node
# node_modules/.bin/drizzle-kit migrate` has to still run the migrator, and
# compose's one-shot `migrate` service depends on exactly that — an entrypoint
# that ignored its arguments would silently start a web server instead, which is
# how this was caught.
if [ "$#" -gt 0 ]; then
  exec "$@"
fi

case "${FORUM_ROLE:-web}" in
  worker)
    exec node apps/worker/worker.cjs
    ;;
  migrate)
    # Runs to completion and exits; compose's one-shot service waits on it.
    exec node apps/worker/migrate.cjs
    ;;
  web)
    exec node apps/forum/server.js
    ;;
  *)
    echo "Unknown FORUM_ROLE: ${FORUM_ROLE}. Expected 'web' or 'worker'." >&2
    exit 1
    ;;
esac
