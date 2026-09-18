# Troubleshoot a running board

Start with the symptom you can observe. Run diagnostics in the affected deployment and verify the result after changing its configuration.

## Troubleshooting

### Migration does not complete

```sh
docker compose logs migrate
```

Check database health, connection values, required secrets, and the selected release. Web and worker correctly wait when migration fails.

A run that produces no output and does not exit is waiting for the advisory lock, which means another migration holds it — an overlapping deploy, usually. Let it finish; the waiting run then applies nothing and exits 0. A run that hangs with no other migration in flight is a connection problem rather than a lock one: on a managed database, confirm `DIRECT_DATABASE_URL` names the direct connection string and not the pooler. See [Migrations](database-operations.md#migrations).

### Pages load but mail or tasks do not run

```sh
docker compose ps worker
docker compose logs --since 1h worker
```

Validate the worker environment and its access to PostgreSQL and the configured mail endpoint.

### Uploads disappear after recreation

Confirm web and worker both mount the persistent upload volume at `/app/.uploads`. Container layers are replaceable and must not hold the only copy.

### Redirects use the wrong origin

Set `APP_URL` to the public HTTPS origin, not an internal container address. Check reverse-proxy forwarding and recreate affected services.

### A documented command is unavailable

```sh
docker compose run --rm web meith --help
```

Use documentation and CLI output from the version you operate.
