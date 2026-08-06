# Running a board on your own VPS

The way this project is deployed. One machine you rent, four containers, a
reverse proxy in front, and nothing between you and the board.

About thirty minutes on a fresh server, most of it waiting for a Docker build.
From roughly **€4 a month** at Hetzner, DigitalOcean, Vultr, Scaleway or
whoever you already use — the board is not fussy about whose machine it is.

> [!NOTE]
> This is the only deployment route this project supports, and that is a
> decision rather than an omission. A board asks three things of wherever it
> runs: a scheduler that goes off every minute, a disk that survives a restart,
> and a process that outlives a request. A plain server gives you all three
> without being asked. See [Why not serverless](#why-not-serverless) at the end.

## What you need

| | |
|---|---|
| **A server** | 2 GB RAM, 2 vCPU, 20 GB disk. Ubuntu 24.04 LTS below; any distro with Docker is fine. |
| **A domain** | Pointed at the server's IP with an `A` record, before you start — the certificate step needs it resolving. |
| **Twenty minutes** | And a terminal. |

1 GB works for a quiet board and is tight during the build; if that is what you
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
rebuild, and because the compose file is a file you are meant to read and edit.

## 3. Write the environment

The compose file reads `.env` from beside it. Nothing in it belongs in git —
`.gitignore` already covers it.

```sh
cat > .env <<EOF
POSTGRES_PASSWORD=$(openssl rand -hex 32)
AUTH_SECRET=$(openssl rand -base64 32)
TICK_SECRET=$(openssl rand -base64 32)
APP_URL=https://board.example
PORT=127.0.0.1:3000
EOF
chmod 600 .env
```

> [!NOTE]
> `hex` for the database password and `base64` for the two secrets, and the
> difference is not stylistic. The password is substituted into a
> `postgres://forum:…@postgres:5432/forum` URL, and base64's alphabet includes
> `/` and `+` — so about one password in three produces `TypeError: Invalid
> URL` from the migration and a stack trace that says nothing about passwords.
> Hex has no such characters. The two secrets are never part of a URL.

Rerunning that heredoc rewrites all five values. If the board is already
installed, changing `POSTGRES_PASSWORD` locks it out of its own database —
Postgres keeps the password from when the volume was created.

Five lines, and each one matters:

| | |
|---|---|
| `POSTGRES_PASSWORD` | The database's own password. Generated, never typed, and hex — see the note above. |
| `AUTH_SECRET` | Signs sessions. There is deliberately no default — a shipped one is a board every reader of the source can sign a session for. |
| `TICK_SECRET` | Guards `/api/system/tick`, which is publicly routable. |
| `APP_URL` | Your real origin, absolute, no trailing slash. Every link in an e-mail is built against it, so a board with this wrong sends password resets that go nowhere. |
| `PORT` | **`127.0.0.1:3000`, not `3000`.** Binding to all interfaces publishes the board on port 3000 alongside your HTTPS one — plaintext, no certificate, and Docker writes its own iptables rules, so `ufw` does not stop it. |

Rotating `AUTH_SECRET` later signs everybody out. That is the whole consequence;
it is a safe thing to do if you think it leaked.

[`.env.example`](../.env.example) at the repository root documents every other
variable. The five above are the ones with no sensible default.

## 4. Start it

```sh
docker compose up -d --build
```

The first build takes five to ten minutes. Four containers come up in order:

| Container | What it does |
|---|---|
| `postgres` | The board. A named volume, so recreating the container keeps the data. |
| `migrate` | Applies the schema and **exits**. `web` and `worker` wait for it to succeed, so the code never talks to a schema behind it. |
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

Caddy, because it gets a certificate and renews it without being asked. On the
host, not in the compose file:

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

## 6. Install the board

Open `https://board.example/install`.

It checks your environment before it offers you a form, and separates what
blocks the install from what will be wrong later. Read that report — nearly
every way a new board fails is visible in it.

Then five named steps: migrations, the board's name, your administrator account,
a first forum, and then it seals itself.

> [!IMPORTANT]
> Sealing is deliberate and cannot be undone. `/install` answers 404 from then
> on. Run it against the database you are going to keep.

[Quickstart](./quickstart.md#4-run-the-installer) walks through the installer
screen by screen.

## 7. Configure mail, before you invite anybody

A board that has never had `MAIL_DRIVER` set **sends no mail at all**. The
default writes each message to the container log and delivers nothing, so
password reset and registration confirmation both fail silently. Nobody
notices until the first member cannot get back in.

Add four lines to `.env` and restart:

```sh
MAIL_DRIVER=http
MAIL_HTTP_ENDPOINT=https://api.resend.com/emails
MAIL_HTTP_TOKEN=re_…
MAIL_FROM=noreply@board.example
```

```sh
docker compose up -d
```

All four are required together; the board refuses to boot naming whichever is
missing. Verify the sending domain with your provider first and keep `MAIL_FROM`
on it — otherwise every message is rejected with a 4xx, which the driver treats
as a configuration error and does not retry.

Resend's API matches the driver's JSON body as-is. Postmark and Mailgun use
different field names and would need a driver change; see
[Mail](./operating.md#mail).

## The operator CLI

Everything you should not need a browser for. It ships **inside the image**, so
the server needs no toolchain, no checkout and no Node:

```sh
docker compose run --rm --no-deps web node apps/cli/cli.cjs --help
```

Worth an alias in `~/.bashrc`:

```sh
alias forum='docker compose -f ~/meith/docker-compose.yml run --rm --no-deps web node apps/cli/cli.cjs'
```

```sh
forum user:create --admin        # a second administrator, or the first if /install is sealed
forum migrate                    # apply pending migrations
forum task:run                   # run the tick once, by hand
forum search:reindex             # after a large import
```

`--rm` matters: without it every invocation leaves a stopped container behind.
`--no-deps` matters too — without it, every `forum` command re-runs the whole
migration container first. Harmless (migrations are idempotent) and slow enough
to be confusing.

## Day two

### Backups

Two things to keep, and they are separate: the database and the uploads.

```sh
docker compose exec -T postgres pg_dump -U forum forum | gzip > board-$(date +%F).sql.gz
docker run --rm -v meith_uploads:/u -v "$PWD":/out alpine \
  tar czf /out/uploads-$(date +%F).tar.gz -C /u .
```

Check the volume's real name with `docker volume ls` — Compose prefixes it with
the project directory, so a clone in `~/board` gives you `board_uploads`.

Put both in a cron and **copy them off the machine**. A backup on the server is
a backup of the thing most likely to fail.

```sh
0 4 * * * cd ~/meith && ./backup.sh >> ~/backup.log 2>&1
```

Restore is `gunzip -c … | docker compose exec -T postgres psql -U forum forum`
into an empty database. Test it once, on a spare server, before you need it.
[Backup and restore](./operating.md#backup-and-restore) has the full procedure
and the order the two have to go back in.

### Upgrading

```sh
cd ~/meith
git pull
docker compose up -d --build
```

`migrate` runs first and the others wait for it, so the schema is never behind
the code. **Take a backup first**: migrations are forward-only, recovery is by
restore, and there is no down migration to undo a destructive one.

[Upgrading a board](./upgrading.md) covers how far you can jump in one go and
what to do when a migration fails halfway.

### Watching it

```sh
docker compose logs -f web worker
docker compose ps
```

`/admin` → **System health** is the screen that matters. It reports each
scheduled task against its own interval, and a stale tick is called out loudly
there — because when the tick stops, nothing errors. Bans stop expiring, digests
stop sending, counters drift, and the board looks fine.

### Building somewhere else

On a 1 GB server the Next build can run out of memory. Build the image on your
laptop or in CI, push it to a registry, and replace `build: .` with
`image: your-registry/meith:latest` in the compose file. Everything else is
unchanged.

## When it goes wrong

| What you see | What it is |
|---|---|
| `AUTH_SECRET must be set` from `migrate` | `.env` is not beside the compose file, or you ran `docker compose` from another directory. |
| `TypeError: Invalid URL` from `migrate` | A `/` or `+` in `POSTGRES_PASSWORD`. Generate it with `openssl rand -hex 32`. |
| `migrate` exits non-zero | Read its log. A failed migration stops the stack on purpose rather than serving against a half-applied schema. |
| Worker logs `worker started` every few seconds | It is crash-looping. `docker compose logs worker` shows the throw above each restart. |
| 502 from the proxy | The web container is not up, or `PORT` is not `127.0.0.1:3000`. `curl -I http://127.0.0.1:3000/api/health` on the host settles which. |
| 413 on an upload | The proxy's body limit, not the board's. See `max_size` above. |
| Password reset "sent" and never arrives | `MAIL_DRIVER` is still `log`. Check `docker compose logs web` — the message is right there in it. |
| `/install` returns 404 | It sealed itself. That is normal after the install. Use `forum user:create --admin`. |
| Uploads vanish after a redeploy | The `uploads` volume is not mounted. `docker volume ls` and `docker compose config` will show it. |

[Running a board](./operating.md) is the operator handbook — permissions,
themes, plugins, spam, imports and the failures that actually happen.

## What you are taking on

Worth being plain about, because the alternative to a platform is you:

- **Backups are yours.** Nobody else is taking one.
- **Security updates are yours.** `unattended-upgrades` for the host, and a
  `git pull` and rebuild for the board.
- **Uptime is yours.** `restart: unless-stopped` covers a crash and a reboot; it
  does not cover a disk filling up.
- **The certificate is yours**, though Caddy makes that a solved problem.

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
configuration for it, or answer for it. A €4 server does all three things by
existing, which is why it is the only route documented here.
