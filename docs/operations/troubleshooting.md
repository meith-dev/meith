# Troubleshooting

## Migration does not complete

Run `docker compose logs migrate`. Check database health, connection values, secrets and release version. Web waits for successful migration.

Overlapping core migrations wait on an advisory lock. If no other migration is running, verify `DIRECT_DATABASE_URL` points directly to PostgreSQL, not a transaction pooler. See [Database operations](database-operations.md).

## Pages load but mail or tasks do not run

Run `docker compose ps worker` and `docker compose logs --since 1h web worker`. Check tick credentials and response bodies, then the failing task and mail configuration. The generated worker calls web; it does not execute tasks itself.

## Uploads disappear after recreation

Check persistent storage mounts at `/app/.uploads` for services using local files. Files in disposable container layers are lost on recreation.

## Redirects use the wrong origin

Set `APP_URL` to the public HTTPS origin, check proxy forwarding and recreate affected services.

## A documented command is unavailable

Run `docker compose run --rm web meith --help`. Match the documentation and command to the installed release; follow [Upgrades](upgrading.md) if needed.
