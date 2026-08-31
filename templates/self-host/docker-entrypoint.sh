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
# `docker run <image> node_modules/.bin/meith --help` should still run
# the CLI rather than silently starting the web server.
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
