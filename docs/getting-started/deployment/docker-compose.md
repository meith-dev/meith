# Deploying by hand

**No panel.** The [Quickstart](./coolify.md) deploys a board with
[Coolify](https://coolify.io) — a guided panel that issues the
certificate, generates the secrets, and redeploys with one button — and
is the route most boards should take: same four containers, same
environment contract either way. This page deploys the identical
board — the workspace `npx create-meith` or
[the template](https://github.com/meith-dev/template) writes, the same
shape [the marketplace](../../customization/marketplace.md) installs
into — with Docker Compose alone. Take it if:

- **you already run a proxy** (nginx, Traefik, Caddy) and would rather add
  one vhost than a second thing that wants ports 80 and 443;
- **you want no extra moving parts** — Coolify is a daemon, a database and
  a proxy of its own, a fair price for what it does and not free;
- **the machine is too small for it** — Coolify wants ~2 GB to itself;
- **you are deploying into something else** — an existing Swarm, a Nomad
  job, a CI pipeline that already builds images.

What you give up: Coolify's certificate, its generated secrets, its
redeploy button, and its own scheduled off-host backup. All four become
yours, and the first is the one people underestimate — the board still
takes its own backups either way, see [What you are taking
on](#what-you-are-taking-on).

## What you need

| | |
|---|---|
| **A server** | Your own, anywhere. 2 GB RAM, 2 vCPU, 20 GB disk. Ubuntu 24.04 LTS below; any distro Docker runs on is fine. |
| **A domain** | With an `A` record pointing at the server before you start — the certificate step needs it resolving. |
| **Half an hour** | And a terminal. |

1 GB works for a quiet board but is tight during the build. If that is
what you have, [build somewhere else](#building-somewhere-else) instead
of on the server.

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

Then close the machine off. Everything a visitor needs is 80 and 443; the
board itself is never exposed directly:

```sh
ufw default deny incoming
ufw allow OpenSSH
ufw allow 80,443/tcp
ufw enable
```

Log out and back in as `meith` — group membership only takes effect on a
new session, and `docker ps` failing with a permissions error at this
point is almost always that.

## 2. Get the board

```sh
curl -fsSL https://www.meith.dev/create-board.sh | bash -s -- my-board
cd my-board
```

Pick `my-board`'s replacement now — the name of the directory this writes
and, if you push it anywhere, of the repository on GitHub. It is not the
board's display name (the installer asks for that later, in [step
6](#6-install-it)), so it does not have to be pretty, only lower-case
with no spaces. `npx create-meith my-board` does the identical thing if
you already have Node.js and would rather use it.

Either command writes a small workspace — `package.json`,
`meith.config.ts`, `board.plugins.json` — that depends on the published
`@meith/web` and `@meith/cli` packages instead of containing a copy of
this repository, which is what turns "installing a plugin" from a fork of
this project into `npm install` and a line in a config file. See
[Consuming the board from a workspace](../../contributing/development.md#consuming-the-board-from-a-workspace)
for the mechanism (`forum-web`/`meith` — the bins the compose file below
actually runs) and [the plugin API](../../customization/plugins.md) for
installing one once the board exists.

The workspace carries a deploy kit with **three** routes onto a server,
not just this one — [Quickstart § Create your
board](./coolify.md#2-create-your-board) is where the other two are
written up in full:

| File(s) | Route |
|---|---|
| `Dockerfile`, `docker-compose.yaml` | Coolify, building the image itself — the Quickstart's default |
| `Dockerfile.prebuilt`, `docker-compose.prebuilt.yaml`, `.github/workflows/build.yml` | Coolify, pulling an image GitHub Actions built — the Quickstart's advanced path |
| `docker-compose.byhand.yaml` | This page — no panel, a `.env` you write |

A board takes one route at a time. **Delete `docker-compose.yaml` now**,
at least: it is the name Docker Compose guesses when nothing tells it
otherwise, and it has no fallback of its own for any secret — it expects
Coolify to have generated one. Leaving it in place is a loaded footgun for
step 4; deleting it removes the trap rather than asking you to remember it
is there. `Dockerfile`, `Dockerfile.prebuilt`, `docker-compose.prebuilt.yaml`
and `.github/workflows/build.yml` are harmless left in place — nothing
auto-discovers any of them the way Compose does its default filename — so
leave those for [Building somewhere else](#building-somewhere-else)
below, or delete them too if you already know you will not need them.

## 3. Write the environment

The compose file reads `.env` from beside it, at the root of `my-board`.
Nothing in it belongs in git; the scaffold's own `.gitignore` already
covers it.

```sh
cat > .env <<EOF
COMPOSE_FILE=docker-compose.byhand.yaml
POSTGRES_PASSWORD=$(openssl rand -hex 32)
AUTH_SECRET=$(openssl rand -base64 32)
TICK_SECRET=$(openssl rand -base64 32)
APP_URL=https://board.example
EOF
chmod 600 .env
```

Edit the `APP_URL` line to your real domain — it is the only line you
type.

| Line | What it is |
|---|---|
| `COMPOSE_FILE` | Names the file every plain `docker compose ...` command from here on should run, so nothing below needs a `-f`. Docker Compose reads it out of `.env` the same way it reads everything else in this file. If you kept `docker-compose.yaml` around in step 2, this is also what stops Compose silently preferring it instead. |
| `POSTGRES_PASSWORD` | The database's own password. Generated, never typed — and hex, see the note below. The compose file has a well-known default, so set your own. |
| `AUTH_SECRET` | Signs unsubscribe links in outgoing mail and seals two-factor secrets. Sessions are not derived from it — they are random tokens stored hashed. There is deliberately no default: a shipped one is a link every reader of the source can forge. Compose refuses to start without it. |
| `TICK_SECRET` | Guards `/api/system/tick`, which is publicly routable. Presented as an `Authorization: Bearer` header, never in the query string — see [driving the tick over HTTP](../../guides/operations/monitoring.md#driving-the-tick-over-http). Compose refuses to start without it too. |
| `PORT` | Optional. The Compose default is `127.0.0.1:3000`, so the TLS proxy is the only route in. Setting this to `3000` deliberately binds every interface and publishes a plaintext route alongside HTTPS; Docker writes its own iptables rules, so `ufw` may not stop it. |
| `APP_URL` | The board's public origin. The compose file otherwise defaults it to `http://localhost:3000`, which is suitable only for local access; every link in every password-reset and confirmation e-mail is built from it. It must be your real origin, not a placeholder. |

> [!NOTE]
> `hex` for the database password and `base64` for the two secrets, and
> the difference is not stylistic: the password is substituted into a
> `postgres://community:…@postgres:5432/community` URL, and base64's
> alphabet includes `/` and `+` — so about one password in three produces
> `TypeError: Invalid URL` from the migration, with a stack trace that
> says nothing about passwords. Hex has no such characters. The two
> secrets are never part of a URL.

Rerunning that heredoc rewrites every value. If the board is already
installed, changing `POSTGRES_PASSWORD` locks it out of its own database —
Postgres keeps the password from when the volume was created.

Rotating `AUTH_SECRET` later signs nobody out — sessions do not depend on
it. What it breaks is the unsubscribe link in every message already sent
(they answer with a polite failure), and every member's two-factor
enrolment, which has to be set up again. Safe if you think it leaked; not
free.

`my-board`'s own `.env.example` documents the `MAIL_*` set too — optional,
overriding the board's own mail settings when present, and worth setting
here if you would rather this deployment were configured entirely from
files.

Metrics and tracing are two more, and are not in that file:
`METRICS_ENABLED`/`METRICS_TOKEN` and `OTEL_ENABLED`/
`OTEL_EXPORTER_OTLP_ENDPOINT` are off by default and not needed for a
working board. See [Monitoring & alerting](../../guides/operations/monitoring.md) once you want a
Prometheus scrape target or distributed tracing.

Anything the variables above do not reach goes in a
`docker-compose.override.yaml` beside this one: name it second in
`COMPOSE_FILE` —

```sh
COMPOSE_FILE=docker-compose.byhand.yaml:docker-compose.override.yaml
```

— and Compose merges the two on every command. It is yours, untracked,
upgrade after upgrade; naming it explicitly like this is what an override
file needs once the base file it extends is not the one Compose would
have guessed on its own.

## 4. Start it

```sh
docker compose up -d --build
```

The first build takes five to ten minutes. Services come up in order:

| Container | What it does |
|---|---|
| `postgres` | The database. A named volume, so recreating the container keeps the data. |
| `migrate` | Applies the schema and **exits 0**. `web` and `worker` wait for it, so the code never runs against a schema behind it. |
| `web` | Next.js, on `127.0.0.1:3000`. |
| `worker` | Calls `/api/system/tick` over HTTP once a minute. `@meith/worker` is not published, so a board outside the meith monorepo drives the tick this way rather than running the compiled process — the same shape [Quickstart § 3](./coolify.md#3-set-your-domain-and-deploy) uses under Coolify. It never touches the database itself; only the request it makes does. |

Check all four:

```sh
docker compose ps
docker compose logs -f worker
```

`migrate` showing `Exited (0)` is correct — it is what the other two
waited for. `worker` should log **nothing** once it is healthy — it only
ever writes a line when a tick request fails, so a quiet log here is the
good sign, not a stuck one.

One `web` container is the topology this walkthrough sets up, and the
right one to start with. When the board outgrows it, [Scaling
out](../../guides/operations/scaling.md) is the path — the compose file
already carries a `redis` profile (running Valkey) and the variables it
needs, so scaling later means changing configuration, not writing a new
file.

Each long-running container carries a memory and CPU ceiling sized for a
small VPS — a gigabyte and two cores for `web`, a gigabyte and a core for
`postgres`, a fraction of either for `worker`, which is a small HTTP loop
rather than a full process — and rotates its own logs at three files of
10 MB each. The ceilings are limits, not reservations: a quiet board
holds nothing back. They are not there to fit inside the machine but to
contain a failure within one container — a leak in `web` gets `web`
killed and restarted, rather than inviting the host's OOM killer to pick
its own victim, which can be `sshd` or Docker itself. A bigger machine
raises them from the same `.env` the secrets live in — `WEB_MEM_LIMIT`,
`WEB_CPUS`, `POSTGRES_MEM_LIMIT`, `POSTGRES_CPUS`, `WORKER_MEM_LIMIT`,
`WORKER_CPUS`, plus `REDIS_MEM_LIMIT` and `REDIS_CPUS` for the scaling
profile — never by editing the compose file, so `npx create-meith@latest
update` has nothing of yours to collide with when it rewrites that file
to a new release's shape. The log cap is what keeps a crash-looping
container from writing the disk full: `restart: unless-stopped` restarts
it forever, and every restart logs.

## 5. Put a proxy in front

Nothing in the compose file terminates TLS. Caddy, because it gets a
certificate and renews it without being asked. On the host, not in the
compose file:

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

`max_size` has to be at least your largest allowed attachment, or the
upload fails at the proxy with a 413 the board never sees and cannot
explain.

Prefer nginx? The equivalent is a `proxy_pass` to `127.0.0.1:3000` with
`client_max_body_size 25m`, `proxy_set_header X-Forwarded-Proto https`,
and certbot for the certificate. Nothing about the board cares which you
pick.

### Count your proxies

The board only sees a visitor's address because the proxy forwards it,
and it has to be told how many proxies did the forwarding. `TRUSTED_PROXY_HOPS`
defaults to `0` — nothing trusted, the header ignored outright — because
that is the only safe default for an image that can also be run with its
port published directly. `docker-compose.byhand.yaml` (and the Coolify
compose files beside it) sets it to `1` for you, matching the one reverse
proxy — Caddy, in the setup above — those files assume, so **there is
nothing to set for this Caddyfile**.

Put a CDN or a second load balancer in front of Caddy and the chain grows
by one: set `TRUSTED_PROXY_HOPS=2` in your `.env`. Whatever the number, it
must match reality — too high and a visitor can forge their address by
sending a forwarding header of their own, walking past
`ADMIN_IP_ALLOWLIST` and the login lockout. If you expose the board's port
directly with nothing in front — do not, but if you do — leave
`TRUSTED_PROXY_HOPS` unset, or set it to `0` explicitly, so the header is
ignored outright.

Whatever you put in front must pass the board's
`Content-Security-Policy` response header through untouched: it carries a
per-request nonce, and a proxy that caches or rewrites it serves pages
whose scripts the browser refuses.

## 6. Install it

Open `https://board.example/install` — your domain, over the proxy you
just set up, not `127.0.0.1:3000`.

The form is three numbered sections: **Your board** (its name), **Your
account** (username, e-mail, password), and **Sending mail** (optional
here, painful later). The board's address is not asked for — `APP_URL`
from your `.env` supplies it, and the preflight report names the value it
is using. **Check that line**: it is the origin every password-reset and
confirmation link is built from, and a wrong `APP_URL` is the one mistake
this route makes easy.

Your username is the name you post under, not a role, and the obvious
names are reserved so no account can impersonate the board — the form
lists them under the box.

Fill in mail here too. It is a list of providers rather than a page of
server details — pick the one you have and the host, port and TLS mode
come with it — and a **test message goes to your address before the first
migration**, installing nothing if it fails.

Everything else about the installer — the preflight report, the five
steps, the sealing that cannot be undone — is the same on both routes and
written once:

- **[Quickstart § Run the installer](./coolify.md#4-run-the-installer)**
- **[Quickstart § Mail](./coolify.md#5-mail)** — the answer sheet for
  the provider list. `/admin/settings?group=mail` changes it afterwards
  with no redeploy; the `MAIL_*` variables in the `.env` beside this
  stack override both.
- **[Operations](../../guides/operations/operating.md)** — the operator handbook:
  backups, the CLI, permissions, spam, and the failures that actually
  happen.

## Upgrading

```sh
cd ~/my-board
npx create-meith@latest update
```

That moves every `@meith/*` pin — and `next` beside them — in
`package.json`, and rewrites every deploy file the scaffold owns,
`docker-compose.byhand.yaml` included, to the new release's shape; a file
you have edited yourself is left alone and named in the output. Read what
it prints before you deploy — the linked release notes' **Migrations:**
line says what this release does to the schema — and **take a backup
first**: migrations are forward-only and recovery is by restore; see
[Backups](../../guides/operations/backups.md), whose *Back up before
migrating* setting makes `migrate` take it itself. If this workspace
lives in git, commit the result now.

```sh
docker compose up -d --build
```

`migrate` runs first and the others wait for it, so the schema is never
behind the code. That covers **core migrations only**. Plugin migrations
run through `meith upgrade` — see
[the operator CLI](../../guides/operations/operating.md#the-operator-cli) for how to run it on
this deployment, and [Upgrading a board](../../guides/operations/upgrading.md) for how far you
can jump in one go. A board pushed to GitHub does not even have to run
the updater by hand: the scaffold's own
`.github/workflows/update.yml` runs it weekly and opens a pull request
with the result.

## Building somewhere else

On a 1 GB server the Next build can run out of memory. The fix is not to
build there: build `Dockerfile.prebuilt` — the one starting `FROM` the
published, framework-only `ghcr.io/meith-dev/meith-base` image, so it
only ever installs this board's own delta on top of an already-warm
`node_modules` tree — somewhere else instead, and pull the result.

**On GitHub Actions, for free.** Push `my-board` to GitHub and
`.github/workflows/build.yml`, already in the workspace if you kept it in
step 2, builds `Dockerfile.prebuilt` on every push to `main` and pushes
the result to `ghcr.io/<you>/my-board` — using only the automatic
`GITHUB_TOKEN` every run already carries, no secret to add. Its own
**Summary** tab prints the exact image once the run is green, and a link
to check the package is public — a build from a public repository
usually lands public already.

**On your own machine**, if you would rather not use GitHub Actions at
all:

```sh
docker build -f Dockerfile.prebuilt --build-arg MEITH_VERSION=$(node -p "require('./package.json').dependencies['@meith/web']") -t my-board .
docker push my-board   # wherever you tag it to push to
```

Either way, change the `build: .` line under **both** `migrate` and `web`
in `docker-compose.byhand.yaml` to the image you just built:

```yaml
image: ghcr.io/<you>/my-board:latest
```

`docker compose up -d` then pulls rather than builds. Pin the exact tag
once the board is settled and you want upgrades happening only when you
choose — a floating tag turns the next incidental `docker compose pull`
into an unplanned upgrade, the same reasoning
[Quickstart § Set your domain and deploy](./coolify.md#3-set-your-domain-and-deploy)
walks through for the equivalent Coolify setting.

## When it goes wrong

| What you see | What it is |
|---|---|
| `AUTH_SECRET must be set`, before any container starts | Compose itself refusing to interpolate: `.env` is not beside the compose file, or you ran `docker compose` from another directory. |
| Every secret in `docker compose config` comes back blank, or the board installs with a password you never set | `.env` was not read, and Compose fell back to `docker-compose.yaml` — Coolify's own file, still in this directory if you kept it in step 2. That file's secrets have no fallback of their own; they resolve empty rather than failing loudly. Delete it, or confirm `COMPOSE_FILE` is set in `.env` and that you are in `my-board`'s own directory. |
| `TypeError: Invalid URL` from `migrate` | A `/` or `+` in `POSTGRES_PASSWORD`. Generate it with `openssl rand -hex 32`. |
| `migrate` exits non-zero | Read its log. A failed migration stops the stack on purpose rather than serving against a half-applied schema. |
| `worker` logs `tick failed` repeatedly | The board it is calling is not answering — check `web`'s own log first; the loop container has no logic of its own to break. |
| 502 from the proxy | The web container is not up, or `PORT` is not `127.0.0.1:3000`. `curl -I http://127.0.0.1:3000/api/health` on the host settles which. |
| 413 on an upload | The proxy's body limit, not the board's. See `max_size` above. |
| Uploads vanish after a redeploy | The `uploads` volume is not mounted. `docker volume ls` and `docker compose config` will show it. |
| The board is reachable on `:3000` as well as `:443` | `PORT` is `3000` rather than `127.0.0.1:3000`. Docker writes its own iptables rules, so `ufw` will not have stopped it. |
| Password reset says "check your inbox" and nothing arrives | Mail is not configured, or the provider is refusing it. `/admin/settings?group=mail` → **Send a test message to me** answers which, and prints the provider's own refusal. |
| Mail arrives, but its links point at the wrong host | `APP_URL` in `.env` is wrong — fix it there and redeploy. |

[Operations § Troubleshooting](../../guides/operations/operating.md#troubleshooting)
covers the failures that are about the board rather than the deployment.

## What you are taking on

Worth being plain about, because this is the route with no panel behind
it:

- **Backups are yours.** Nobody else is taking one. The board schedules
  its own — **Admin → Settings → Backups** — bundling the database *and*
  the uploads into the `backups` volume and, once you name a bucket, off
  the server; the bucket is still yours to rent. See
  [Backups](../../guides/operations/backups.md), and the
  [disaster-recovery runbook](../../guides/operations/disaster-recovery.md) for the day they
  are all you have.
- **Certificates are yours.** Caddy makes it a solved problem, but it is
  a problem you now own.
- **Security updates are yours.** `unattended-upgrades` for the host; a
  `create-meith` update and a rebuild for the board.
- **Uptime is yours.** `restart: unless-stopped` covers a crash and a
  reboot; it does not cover a disk filling up. The compose file caps what
  each container may log, so a crash-loop cannot fill the disk by itself —
  but the database and the uploads still grow, and watching the disk is
  still yours.

In exchange: no platform limits, no per-seat pricing, no vendor reading
your members' posts, and a board you can move to another machine with a
`pg_dump` and a `tar`.

## Why a server, and not functions

You can run this board on functions, and [Running on
Vercel](./vercel.md) is that route written out: the driver set, the build
command that carries the migration, the cron job that stands in for the
worker, and how to leave again.

A server is still the recommended default, and the reason is that
everything this page gives you for free becomes configuration and a
second bill there. A process that outlives a request is what a worker
*is*; without one, the tick is an HTTP endpoint somebody else's scheduler
has to call, at a cadence their plan decides. A disk that survives a
restart becomes an object store. A shared cache becomes a managed Redis.
The migration stops being a one-shot job beside the board and becomes
part of the build, which trades the deploy window for a different one
rather than closing it. None of that is unworkable — it is documented
because it works — but it is four vendors and a longer list of things to
get right, in exchange for not owning a machine. One machine, one
database, one `pg_dump` that is the whole board is the simpler answer,
and it is the one most boards should take.
