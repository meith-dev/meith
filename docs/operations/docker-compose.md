# Deploy with Docker Compose

Requires [Docker with Compose](https://docs.docker.com/engine/install/), a server, a domain and an HTTPS reverse proxy. Forward the proxy to `127.0.0.1:3000`, preserving host and forwarded protocol. Keep PostgreSQL and the web port off the public network.

## Create the board

With Node.js 22+ and npm:

```sh
npx create-meith my-board
cd my-board
```

Without Node on the server:

```sh
curl -fsSL https://www.meith.dev/create-board.sh | bash -s -- my-board
cd my-board
```

This route uses `docker-compose.byhand.yaml`; the default Compose file targets Coolify.

## Set the environment

For a new board only, create `.env` in its directory:

> [!CAUTION]
> This command replaces `.env`. Do not run it over an existing deployment: changing stored database credentials or `AUTH_SECRET` can break access and sealed settings.

```sh
cat > .env <<EOF
COMPOSE_FILE=docker-compose.byhand.yaml
POSTGRES_PASSWORD=$(openssl rand -hex 32)
AUTH_SECRET=$(openssl rand -hex 32)
TICK_SECRET=$(openssl rand -hex 32)
APP_URL=https://board.example
EOF
chmod 600 .env
```

Use the actual public origin. Keep `.env` out of git and retain a protected off-site copy.

## Start

```sh
docker compose up -d --build
docker compose ps
docker compose logs --since 10m migrate web worker
```

The database starts first. Core migrations must exit 0 before web and worker start. Keep database and upload volumes persistent. If a build exceeds server capacity, use the generated prebuilt-image workflow; do not remove data volumes.

## Proxy and installation

Configure HTTPS and set `TRUSTED_PROXY_HOPS` to the actual trusted proxy count, including any CDN. Keep the web port bound to loopback; published Docker ports can bypass host-firewall assumptions.

Open `/install`, unlock with `AUTH_SECRET` and create the administrator. Configure and test mail. Complete [Community setup](../administration/first-steps.md), [Scheduled tasks](scheduled-tasks.md) and a [backup/restore rehearsal](backups.md).

Never run `docker compose down -v` on data you intend to retain. For maintenance, use [Upgrades](upgrading.md) and [Troubleshooting](troubleshooting.md).
