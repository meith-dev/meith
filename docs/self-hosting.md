# Running a board on your own server

One machine, four containers, and nothing between you and the board. Hetzner,
DigitalOcean, Vultr, Scaleway, a box in a cupboard — the board is not fussy
about whose machine it is.

Two shapes, and they deploy the same four containers from the same image. Pick
on how much you want to operate by hand.

| | [**Coolify**](#a-coolify) | [**Docker Compose**](#b-docker-compose-directly) |
|---|---|---|
| What it is | A self-hosted panel on your server that deploys, renews certificates and redeploys on push | The compose file, run by you |
| Certificates | Handled | Caddy or nginx, yours to set up |
| Secrets | Generated on first deploy, never typed | You generate them into a `.env` |
| Upgrades | A button, or automatic on push | `git pull && docker compose up -d --build` |
| You should pick it if | You would rather click than SSH | You already run a proxy, or you want no extra moving parts |
| Setup | ~20 minutes | ~30 minutes |

Coolify is the simpler one and is still entirely your own server — it is
software you install on the same machine, not a service you sign up to. Nothing
about the board knows which shape deployed it.

> [!NOTE]
> These are the only deployment routes this project supports, and that is a
> decision rather than an omission. A board asks three things of wherever it
> runs: a scheduler that goes off every minute, a disk that survives a restart,
> and a process that outlives a request. A server gives you all three without
> being asked. See [Why not serverless](#why-not-serverless) at the end.

## What you need

| | |
|---|---|
| **A server** | Your own, anywhere. 2 GB RAM, 2 vCPU, 20 GB disk. Ubuntu 24.04 LTS below; any distro with Docker is fine. Coolify wants 2 GB of its own, so 4 GB is more comfortable there. |
| **A domain** | Pointed at the server's IP with an `A` record, before you start — certificates need it resolving. |
| **Half an hour** | And a terminal. |

1 GB works for a quiet board and is tight during the build; if that is what you
have, [build the image elsewhere](#building-somewhere-else) and pull it.

---

# A. Coolify

A panel you install on your own server. It clones this repository, builds the
image, runs the compose file, gets the certificate, and redeploys when you push.

Requires **Coolify v4.0.0-beta.411 or newer** — magic environment variables in a
compose file from a Git source arrived in that release, and they are what make
this deploy ask you for nothing.

## A1. Install Coolify

On a fresh server, as root:

```sh
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

It installs Docker if it is missing, then serves its own UI on port **8000**.
Open `http://your-server-ip:8000` and create the first account immediately —
that page is open until somebody registers on it.

Then close the machine down to what is used:

```sh
ufw default deny incoming
ufw allow OpenSSH
ufw allow 80,443/tcp
ufw allow 8000/tcp     # the panel; drop this once you have put it behind a domain
ufw enable
```

Coolify can serve its own UI over HTTPS on a subdomain, which is worth doing
before you close 8000 — its own documentation covers it, and it is the same
proxy that will serve your board.

## A2. Add the board as a resource

In the panel: **New Resource → Docker Compose → Public Repository**.

| Field | Value |
|---|---|
| Repository | `https://github.com/meith-dev/meith` |
| Branch | `main` |
| Compose file | `/docker-compose.coolify.yml` |

The compose file path is the one thing worth checking twice. The default is
`/docker-compose.yml`, which is the *other* shape — it publishes a port and
expects a `.env` you have not written, so it deploys and then is not reachable
through the proxy.

Coolify's UI moves between releases, so treat those as the values rather than
the click path.

## A3. Set the domain, then deploy

Coolify offers a generated domain and accepts your own. Set yours — an `A`
record already pointing at the server — and press deploy.

The first build takes five to ten minutes. What happens without your involvement:

- **The secrets are generated.** `AUTH_SECRET` and `TICK_SECRET` come from
  `SERVICE_BASE64_64_*`, filled in on the first deploy and kept for the life of
  the resource. The database password comes from `SERVICE_PASSWORD_POSTGRES`.
  All three are visible in the panel; none is typed.
- **The board is told its own URL.** `SERVICE_FQDN_WEB_3000` asks for a domain
  routed to port 3000 and `APP_URL` is that domain with a scheme. Every link in
  an e-mail is absolute against it.
- **The certificate is issued and renewed** by Coolify's proxy.
- **Nothing is published on the host.** The compose file has no `ports:`, so the
  proxy is the only way in — a published port would put the board on the host as
  well, plaintext and around the certificate.

Watch the deploy log. `migrate` runs to completion and exits `0`; `web` and
`worker` wait for it, so the code never talks to a schema behind it.

Now go to [Install the board](#install-the-board).

## Day two, under Coolify

**Upgrades** are the **Redeploy** button, or automatic — enable the webhook and
a push to `main` deploys itself. `migrate` runs first either way. Take a backup
first regardless: migrations are forward-only.

**Backups** of Postgres are scheduled in the panel, per resource, with S3 as a
destination. Do that, and then read [Backups](#backups) anyway — Coolify backs
up the *database*, and the uploads volume is a second thing that has to be
copied off the machine.

**Mail** goes in the resource's environment variables rather than a `.env`:
`MAIL_DRIVER`, `MAIL_HTTP_ENDPOINT`, `MAIL_HTTP_TOKEN`, `MAIL_FROM`. See
[Configure mail](#configure-mail-before-you-invite-anybody) — it is the one
thing no deploy configures for you, and until it is done password reset fails
silently.

**Logs and a shell** are in the panel, per container. The
[operator CLI](#the-operator-cli) runs from the terminal it gives you.

---

# B. Docker Compose directly

No panel, no extra daemon. The compose file, a `.env`, and a reverse proxy you
run yourself.

## B1. Prepare the server

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

## B2. Get the board

```sh
git clone https://github.com/meith-dev/meith.git
cd meith
```

A clone rather than a release tarball, because upgrading is `git pull` and a
rebuild, and because the compose file is a file you are meant to read and edit.

## B3. Write the environment

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

## B4. Start it

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

## B5. Put a proxy in front

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

---

# Both shapes, from here

## Install the board

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

## Configure mail, before you invite anybody

A board that has never had `MAIL_DRIVER` set **sends no mail at all**. The
default writes each message to the container log and delivers nothing, so
password reset and registration confirmation both fail silently. Nobody
notices until the first member cannot get back in.

Four settings, in the resource's environment variables under Coolify or in
`.env` under Compose:

```sh
MAIL_DRIVER=http
MAIL_HTTP_ENDPOINT=https://api.resend.com/emails
MAIL_HTTP_TOKEN=re_…
MAIL_FROM=noreply@board.example
```

Then redeploy, or `docker compose up -d`.

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

Under Coolify, open the container's terminal from the panel and run
`node apps/cli/cli.cjs --help` there.

Worth an alias in `~/.bashrc` on a Compose board:

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
Coolify's scheduled backups cover the first; the second is yours either way.

```sh
docker compose exec -T postgres pg_dump -U forum forum | gzip > board-$(date +%F).sql.gz
docker run --rm -v meith_uploads:/u -v "$PWD":/out alpine \
  tar czf /out/uploads-$(date +%F).tar.gz -C /u .
```

Check the volume's real name with `docker volume ls` — Compose prefixes it with
the project directory, and Coolify prefixes it with the resource's UUID.

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

Under Coolify: **Redeploy**, or push to `main` with the webhook enabled.

Under Compose:

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

`/admin` → **System health** is the screen that matters, whichever shape you
deployed. It reports each scheduled task against its own interval, and a stale
tick is called out loudly there — because when the tick stops, nothing errors.
Bans stop expiring, digests stop sending, counters drift, and the board looks
fine.

### Building somewhere else

On a 1 GB server the Next build can run out of memory. Build the image on your
laptop or in CI, push it to a registry, and replace `build:` with
`image: your-registry/meith:latest` in whichever compose file you are using.
Everything else is unchanged.

## When it goes wrong

| What you see | What it is |
|---|---|
| `AUTH_SECRET must be set` from `migrate` | Compose: `.env` is not beside the compose file, or you ran `docker compose` from another directory. Coolify: it deployed `/docker-compose.yml` instead of `/docker-compose.coolify.yml`. |
| `TypeError: Invalid URL` from `migrate` | A `/` or `+` in `POSTGRES_PASSWORD`. Generate it with `openssl rand -hex 32`. |
| `migrate` exits non-zero | Read its log. A failed migration stops the stack on purpose rather than serving against a half-applied schema. |
| Worker logs `worker started` every few seconds | It is crash-looping. `docker compose logs worker` shows the throw above each restart. |
| The board deploys under Coolify and 404s at the domain | Almost always the wrong compose file — the ordinary one publishes a port and declares no `SERVICE_FQDN_WEB_3000`, so the proxy has nothing to route. |
| 502 from the proxy | Compose: the web container is not up, or `PORT` is not `127.0.0.1:3000`. `curl -I http://127.0.0.1:3000/api/health` on the host settles which. |
| 413 on an upload | The proxy's body limit, not the board's. See `max_size` above; under Coolify it is a Traefik label on the resource. |
| Password reset "sent" and never arrives | `MAIL_DRIVER` is still `log`. Check the web container's log — the message is right there in it. |
| `/install` returns 404 | It sealed itself. That is normal after the install. Use `forum user:create --admin`. |
| Uploads vanish after a redeploy | The `uploads` volume is not mounted. `docker volume ls` and `docker compose config` will show it. |

[Running a board](./operating.md) is the operator handbook — permissions,
themes, plugins, spam, imports and the failures that actually happen.

## What you are taking on

Worth being plain about, because the alternative to a platform is you. Coolify
takes on the certificate, the redeploy and a database backup schedule; the rest
is yours in both shapes:

- **Backups are yours.** Nobody else is taking one — and under Coolify, the
  uploads volume is not in the scheduled backup.
- **Security updates are yours.** `unattended-upgrades` for the host, and a
  redeploy for the board. Coolify itself also updates.
- **Uptime is yours.** `restart: unless-stopped` covers a crash and a reboot; it
  does not cover a disk filling up.
- **The certificate** is Coolify's if you use it, and Caddy's if you do not.
  Either way it is a solved problem.

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
