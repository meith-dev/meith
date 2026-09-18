# Deploy with Docker Compose

Run Meith on a server using Docker Compose and a reverse proxy you manage. You need Docker with the Compose plugin, a domain pointing at the server, enough disk for data and backups, and capacity to build the image. A small server may need the prebuilt route described in the generated board README.

## 1. Prepare hosting

Install Docker using its [official platform instructions](https://docs.docker.com/engine/install/). Configure your firewall and remote access without locking yourself out. Public traffic should reach the HTTPS proxy; do not expose the database or the board's plain HTTP port directly.

Use a maintained HTTPS reverse proxy on the server. The steps below assume it forwards requests to `127.0.0.1:3000` and preserves the original host and forwarded protocol.

## 2. Create the board

With Node.js 22 or newer:

```sh
npx create-meith my-board
cd my-board
```

Without Node on the server, use the published installer:

```sh
curl -fsSL https://www.meith.dev/create-board.sh | bash -s -- my-board
cd my-board
```

This guide uses `docker-compose.byhand.yaml`. The scaffold's default `docker-compose.yaml` is for Coolify.

## 3. Create the environment once

For a new board only, run from its directory:

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

Change `APP_URL` to the actual public HTTPS origin. Keep `.env` outside git and store a protected recovery copy off-site.

> [!CAUTION]
> Do not rerun this command on an installed board. It replaces secrets. PostgreSQL retains the password stored in its existing volume, and changing `AUTH_SECRET` breaks sealed credentials and two-factor enrollment.

`COMPOSE_FILE` selects the by-hand file for subsequent commands. Leave the web binding on loopback; publishing `3000` on every interface exposes a route around the HTTPS proxy. Docker's port rules may bypass host-firewall assumptions.

## 4. Start and check the containers

```sh
docker compose up -d --build
docker compose ps
docker compose logs --since 10m migrate web worker
```

The database starts first, `migrate` applies core migrations and exits successfully, then web and the HTTP tick worker serve the board. An exited migration container with code 0 is expected. Uploads and database data must remain on their persistent volumes.

If the build runs out of memory, build elsewhere using the generated prebuilt-image workflow. Do not delete volumes to fix a build failure.

## 5. Configure HTTPS and trusted proxies

Point the reverse proxy at the loopback web port and configure the certificate for your domain. Confirm the public URL uses HTTPS and that redirects return to that origin.

Set `TRUSTED_PROXY_HOPS` to the actual number of trusted proxies in front of Meith. Count a CDN if it is in the path. An incorrect value can make address-based protections act on the wrong client address. Do not increase it without understanding the network path.

## 6. Install and verify

Open `/install` on the public domain and unlock it with `AUTH_SECRET`. Resolve preflight blockers, create the administrator account and configure mail. Check delivery before enabling email activation.

Complete [Set up your community](../administration/first-steps.md), then verify [scheduled tasks](scheduled-tasks.md), [backups](backups.md) and a restore rehearsal.

## Maintain the deployment

Keep the board repository and deployment secrets backed up separately. Use [Upgrade Meith](upgrading.md) for releases, [Scaling](scaling.md) for multiple web instances and [Troubleshooting](troubleshooting.md) for failures. Never use `docker compose down -v` on data you intend to keep.
