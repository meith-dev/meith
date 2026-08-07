# Deploying by hand

**Advanced.** The [Quickstart](./quickstart.md) deploys this board with
[Coolify](https://coolify.io) and is the route most people should take: same
image, same four containers, same environment contract, and it issues the
certificate and generates the secrets for you.

This page is the same board without the panel — the compose file, a `.env` you
write, and a reverse proxy you already run. Take it if:

- **you already run a proxy** (nginx, Traefik, Caddy) and would rather add one
  vhost than a second thing that wants ports 80 and 443;
- **you want no extra moving parts.** Coolify is a daemon, a database and a
  proxy of its own, which is a fair price for what it does and not free;
- **the machine is too small for it.** Coolify wants ~2 GB to itself;
- **you are deploying into something else** — an existing Swarm, a Nomad job, a
  CI pipeline that already builds images.

What you give up: certificates, secret generation, the redeploy button, and the
scheduled database backup. All four are things you now do yourself, and the
first is the one people underestimate.

## What you need

| | |
|---|---|
| **A server** | Your own, anywhere. 2 GB RAM, 2 vCPU, 20 GB disk. Ubuntu 24.04 LTS below; any distro Docker runs on is fine. |
| **A domain** | With an `A` record pointing at the server, before you start — the certificate step needs it resolving. |
| **Half an hour** | And a terminal. |

1 GB works for a quiet board and is tight during the build. If that is what you
have, [build the image elsewhere](#building-somewhere-else) and pull it.

## 1. Prepare the server

SSH in as root, make a user, and give it Docker:

```sh
adduser meith
usermod -aG sudo meith
```

Install Docker from Docker's own repository rather than the distro's — the
packaged version is usually old enough to be missing `docker compose`:

```sh
curl -fsSL https://get.docker.com | sh
usermod -aG docker meith
```

Then close the machine off. Everything a visitor needs is 80 and 443; the board
itself is never exposed directly.

```sh
ufw default deny incoming
ufw allow OpenSSH
ufw allow 80,443/tcp
ufw enable
```

Log out and back in as `meith` — group membership only takes effect on a new
session, and `docker ps` failing with a permissions error at this point is
almost always that.

## 2. Get the board

```sh
git clone https://github.com/meith-dev/meith.git
cd meith
```

A clone rather than a release tarball, because upgrading is `git pull` and a
rebuild, and because [`docker-compose.yml`](../docker-compose.yml) is a file you
are meant to read and edit.

## 3. Write the environment

The compose file reads `.env` from beside it. Nothing in it belongs in git —
`.gitignore` already covers it.

```sh
cat > .env <<EOF
POSTGRES_PASSWORD=$(openssl rand -hex 32)
AUTH_SECRET=$(openssl rand -base64 32)
TICK_SECRET=$(openssl rand -base64 32)
PORT=127.0.0.1:3000
EOF
chmod 600 .env
```

**Nothing in that needs editing.** Three `openssl rand` outputs and a fixed
literal — you can paste it as it stands, which is the point: the board's own
address used to be a fifth line here and is asked for by the installer now,
prefilled from the address you load it at.

> [!WARNING]
> If you add `APP_URL` back, it has to be your real origin. A value set here
> **wins over the installer**, so a placeholder left in — `https://board.example`
> — is not a value the installer will correct. It is the origin every password
> reset and confirmation link is built from, and those links go out pointing at a
> domain you do not own. Leaving it out is safer than filling it in with
> something approximate.

> [!NOTE]
> `hex` for the database password and `base64` for the two secrets, and the
> difference is not stylistic. The password is substituted into a
> `postgres://forum:…@postgres:5432/forum` URL, and base64's alphabet includes
> `/` and `+` — so about one password in three produces `TypeError: Invalid
> URL` from the migration and a stack trace that says nothing about passwords.
> Hex has no such characters. The two secrets are never part of a URL.

Rerunning that heredoc rewrites all four values. If the board is already
installed, changing `POSTGRES_PASSWORD` locks it out of its own database —
Postgres keeps the password from when the volume was created.

Four lines, and each one matters:

| | |
|---|---|
| `POSTGRES_PASSWORD` | The database's own password. Generated, never typed, and hex — see the note above. |
| `AUTH_SECRET` | Signs sessions. There is deliberately no default — a shipped one is a board every reader of the source can sign a session for. |
| `TICK_SECRET` | Guards `/api/system/tick`, which is publicly routable. |
| `PORT` | **`127.0.0.1:3000`, not `3000`.** Binding to all interfaces publishes the board on port 3000 alongside your HTTPS one — plaintext, no certificate, and Docker writes its own iptables rules, so `ufw` does not stop it. |

Rotating `AUTH_SECRET` later signs everybody out. That is the whole consequence;
it is a safe thing to do if you think it leaked.

[`.env.example`](../.env.example) at the repository root documents every other
variable, including `APP_URL` and the `MAIL_*` set — both optional, both
overriding the board's own settings when present, and both worth setting here if
you would rather this deployment were configured entirely from files than from a
screen.

## 4. Start it

```sh
docker compose up -d --build
```

The first build takes five to ten minutes. Four containers come up in order:

| Container | What it does |
|---|---|
| `postgres` | The board. A named volume, so recreating the container keeps the data. |
| `migrate` | Applies the schema and **exits 0**. `web` and `worker` wait for it, so the code never talks to a schema behind it. |
| `web` | Next.js, on `127.0.0.1:3000`. |
| `worker` | The tick, in-process, on its own one-minute loop. |

Check all four:

```sh
docker compose ps
docker compose logs -f worker
```

`migrate` showing `Exited (0)` is correct and is what the other two waited for.
The worker should log `worker started` **once**, and then nothing much — if that
line repeats every few seconds, the container is crash-looping and the log above
it says why.

## 5. Put a proxy in front

Nothing in the compose file terminates TLS. Caddy, because it gets a certificate
and renews it without being asked. On the host, not in the compose file:

```sh
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

`/etc/caddy/Caddyfile`, in its entirety:

```caddyfile
board.example {
    reverse_proxy 127.0.0.1:3000
    request_body {
        max_size 25MB
    }
}
```

```sh
sudo systemctl reload caddy
```

`max_size` has to be at least your largest allowed attachment, or the upload
fails at the proxy with a 413 the board never sees and cannot explain.

Prefer nginx? The equivalent is a `proxy_pass` to `127.0.0.1:3000` with
`client_max_body_size 25m`, `proxy_set_header X-Forwarded-Proto https`, and
certbot for the certificate. Nothing about the board cares which you pick.

## 6. Install it, and configure mail

From here the two routes are identical, so those steps are written once:

- **[Quickstart § Run the installer](./quickstart.md#4-run-the-installer)** —
  the preflight report, the five steps, and the sealing that cannot be undone.
- **[Quickstart § Mail](./quickstart.md#5-mail)** — the installer asks for it and
  proves it with a real test message before writing anything, and
  `/admin/settings?group=mail` changes it afterwards with no redeploy. You can
  instead put `MAIL_DRIVER` and its companions in the `.env` beside this stack,
  which overrides the screen and keeps the credential out of the database. A
  board configured neither way sends no mail at all.
- **[Running a board](./operating.md)** — the operator handbook, and everything
  from the day after you install: backups, the operator CLI, upgrades,
  permissions, spam, and the failures that actually happen.

## Upgrading

```sh
cd ~/meith
git pull
docker compose up -d --build
```

`migrate` runs first and the others wait for it, so the schema is never behind
the code. **Take a backup first** — see
[Backup and restore](./operating.md#backup-and-restore). Migrations are
forward-only, recovery is by restore, and there is no down migration to undo a
destructive one.

[Upgrading a board](./upgrading.md) covers how far you can jump in one go and
what to do when a migration fails halfway.

## Building somewhere else

On a 1 GB server the Next build can run out of memory. Build the image on your
laptop or in CI, push it to a registry, and replace `build: .` with
`image: your-registry/meith:latest` in the compose file. Everything else is
unchanged.

The image takes `FORUM_ROLE` — `web`, `worker` or `migrate` — so one image is
all three services. That is what makes the roles impossible to drift apart, and
it is why there is no second Dockerfile.

## Running the tick without a second set of credentials

The `worker` service holds database credentials, which some operators would
rather only the web server did. The compose file ships an alternative behind a
profile: a small container that calls `/api/system/tick` over HTTP once a
minute, presenting `TICK_SECRET`.

```sh
docker compose --profile curl-tick up -d
```

Enable that **or** `worker`, never both. Running both is harmless — a task
claims its work in the database, so concurrent ticks are safe — but it is two
things doing one job.

## When it goes wrong

| What you see | What it is |
|---|---|
| `AUTH_SECRET must be set` from `migrate` | `.env` is not beside the compose file, or you ran `docker compose` from another directory. |
| `TypeError: Invalid URL` from `migrate` | A `/` or `+` in `POSTGRES_PASSWORD`. Generate it with `openssl rand -hex 32`. |
| `migrate` exits non-zero | Read its log. A failed migration stops the stack on purpose rather than serving against a half-applied schema. |
| Worker logs `worker started` every few seconds | It is crash-looping. `docker compose logs worker` shows the throw above each restart. |
| 502 from the proxy | The web container is not up, or `PORT` is not `127.0.0.1:3000`. `curl -I http://127.0.0.1:3000/api/health` on the host settles which. |
| 413 on an upload | The proxy's body limit, not the board's. See `max_size` above. |
| Uploads vanish after a redeploy | The `uploads` volume is not mounted. `docker volume ls` and `docker compose config` will show it. |
| The board is reachable on `:3000` as well as `:443` | `PORT` is `3000` rather than `127.0.0.1:3000`. Docker writes its own iptables rules, so `ufw` will not have stopped it. |

[Running a board § Troubleshooting](./operating.md#troubleshooting) covers the
failures that are about the board rather than about the deployment.

## What you are taking on

Worth being plain about, because this is the route with no panel behind it:

- **Backups are yours.** Nobody else is taking one. Both the database and the
  uploads volume — see [Backup and restore](./operating.md#backup-and-restore).
- **Certificates are yours.** Caddy makes this a solved problem, but it is a
  problem you now own.
- **Security updates are yours.** `unattended-upgrades` for the host, and a
  `git pull` and rebuild for the board.
- **Uptime is yours.** `restart: unless-stopped` covers a crash and a reboot; it
  does not cover a disk filling up.

In exchange: no platform limits, no per-seat pricing, no vendor reading your
members' posts, and a board you can move to another machine with a `pg_dump` and
a `tar`.

## Why not serverless

The question comes up, so: a board needs a process that outlives a request, and
that is the one thing a function cannot be given at any price.

Everything else has a workaround with a bill attached. A per-minute schedule is
a plan feature. A disk that survives a restart is an object store and a second
vendor. But the tick is bounded by the function timeout, a large import cannot
hold a function open, and migrations stop being part of the deploy — so between
the code going live and you running the command, new code is talking to an old
schema.

You can run this board on a function, and this project does not test it, ship a
configuration for it, or answer for it. Your own server does all three things by
existing, which is why it is the only route documented here.
