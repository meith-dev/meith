# Deploying by hand

**Advanced.** The [Quickstart](./quickstart.md) deploys a board with
[Coolify](https://coolify.io) — since 0.17.0, a board of your own rather
than this repository's own image, which is what lets
[the marketplace](./marketplace.md) actually install into it — and is the
route most boards should take: same four containers, same environment
contract either way, and it issues the certificate and generates the
secrets for you. This page deploys **this repository's own stock board**
instead, by hand — same shape, no panel — for whoever minds a community's
machines, not for the organisers; it assumes a terminal, a text editor and
no fear of either. Want your own board's shape without the panel? Skip to
[Custom boards](#custom-boards).

This page is the same board without the panel: the compose file, a `.env`
you write, and a reverse proxy you already run. Take it if:

- **you already run a proxy** (nginx, Traefik, Caddy) and would rather add
  one vhost than a second thing that wants ports 80 and 443;
- **you want no extra moving parts** — Coolify is a daemon, a database and
  a proxy of its own, a fair price for what it does and not free;
- **the machine is too small for it** — Coolify wants ~2 GB to itself;
- **you are deploying into something else** — an existing Swarm, a Nomad
  job, a CI pipeline that already builds images.

What you give up: certificates, secret generation, the redeploy button,
and the scheduled database backup. All four become yours, and the first is
the one people underestimate.

## What you need

| | |
|---|---|
| **A server** | Your own, anywhere. 2 GB RAM, 2 vCPU, 20 GB disk. Ubuntu 24.04 LTS below; any distro Docker runs on is fine. |
| **A domain** | With an `A` record pointing at the server before you start — the certificate step needs it resolving. |
| **Half an hour** | And a terminal. |

1 GB works for a quiet board but is tight during the build. If that is
what you have, [use the published image](#building-somewhere-else) instead
of building.

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
git clone https://github.com/meith-dev/meith.git
cd meith
git checkout "$(git describe --tags --abbrev=0)"   # the newest release
```

A clone rather than a release tarball, because upgrading is a fetch and a
checkout of the next tag, and because
[`docker/compose.yml`](../docker/compose.yml) is a file you are meant to
read and edit. The checkout matters: `main` is development and makes no
promises between releases; a release tag is what the published images are
built from and what [the release process](./release.md) stands behind.

## 3. Write the environment

Everything from here on happens in `docker/` — the compose file lives
there and reads `.env` from beside it. Nothing in that file belongs in
git; `.gitignore` already covers it.

```sh
cd docker
cat > .env <<EOF
POSTGRES_PASSWORD=$(openssl rand -hex 32)
AUTH_SECRET=$(openssl rand -base64 32)
TICK_SECRET=$(openssl rand -base64 32)
APP_URL=https://board.example
EOF
chmod 600 .env
```

Edit the last line to your real domain — it is the only line you type.

| Line | What it is |
|---|---|
| `POSTGRES_PASSWORD` | The database's own password. Generated, never typed — and hex, see the note below. The compose file has a well-known default, so set your own. |
| `AUTH_SECRET` | Signs unsubscribe links in outgoing mail and seals two-factor secrets. Sessions are not derived from it — they are random tokens stored hashed. There is deliberately no default: a shipped one is a link every reader of the source can forge. Compose refuses to start without it. |
| `TICK_SECRET` | Guards `/api/system/tick`, which is publicly routable. Presented as an `Authorization: Bearer` header, never in the query string — see [driving the tick from outside](./operating.md#driving-the-tick-from-outside). Compose refuses to start without it too. |
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

[`.env.example`](../.env.example) at the repository root documents every
other variable, including the `MAIL_*` set — optional, overriding the
board's own mail settings when present, and worth setting here if you
would rather this deployment were configured entirely from files.

That includes `METRICS_ENABLED`/`METRICS_TOKEN` and `OTEL_ENABLED`/
`OTEL_EXPORTER_OTLP_ENDPOINT` — off by default, and not needed for a working
board. See [Monitoring & alerting](./monitoring.md) once you want a
Prometheus scrape target or distributed tracing.

## 4. Start it

```sh
docker compose up -d --build
```

The first build takes five to ten minutes. Four containers come up in
order:

| Container | What it does |
|---|---|
| `postgres` | The database. A named volume, so recreating the container keeps the data. |
| `migrate` | Applies the schema and **exits 0**. `web` and `worker` wait for it, so the code never runs against a schema behind it. |
| `web` | Next.js, on `127.0.0.1:3000`. |
| `worker` | The background tick, in-process, on its own one-minute loop. |

Check all four:

```sh
docker compose ps
docker compose logs -f worker
```

`migrate` showing `Exited (0)` is correct — it is what the other two
waited for. The worker should log `worker started` **once**, and then not
much; if that line repeats every few seconds, the container is
crash-looping and the log above it says why.

One `web` container is the topology this walkthrough sets up, and the
right one to start with. When the board outgrows it, [Scaling
out](./scaling.md) is the path — the compose file already carries the
`redis` profile (running Valkey) and the variables it needs, so scaling
later means changing configuration, not redoing this guide.

Each long-running container carries a memory and CPU ceiling sized for a
small VPS — a gigabyte and two cores for `web`, a gigabyte and a core for
`postgres`, 768 MB for `worker` — and rotates its own logs at three files
of 10 MB each. The ceilings are limits, not reservations: a quiet board
holds nothing back, and their sum deliberately exceeds the 2 GB minimum
above. They are not there to fit inside the machine but to contain a
failure within one container — a leak in `web` gets `web` killed and
restarted, rather than inviting the host's OOM killer to pick its own
victim, which can be `sshd` or Docker itself. A bigger machine raises
them from the same `.env` the
secrets live in — `WEB_MEM_LIMIT`, `WEB_CPUS`, `POSTGRES_MEM_LIMIT`,
`POSTGRES_CPUS`, `WORKER_MEM_LIMIT`, `WORKER_CPUS`, plus `REDIS_MEM_LIMIT`
and `REDIS_CPUS` for the scaling profile — never by editing the compose
file, so an upgrade's `git checkout` has nothing of yours to collide with.
Anything the variables do not reach goes in a `compose.override.yml`
beside the compose file: compose merges it automatically, and it is yours,
untracked, upgrade after upgrade. The log cap is what keeps a
crash-looping container from writing the disk full: `restart:
unless-stopped` restarts it forever, and every restart logs.

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
and it has to be told how many proxies did the forwarding. One — the
setup above — is the default, so **there is nothing to set for this
Caddyfile**.

Put a CDN or a second load balancer in front of Caddy and the chain grows
by one: set `TRUSTED_PROXY_HOPS=2`. Whatever the number, it must match
reality — too high and a visitor can forge their address by sending a
forwarding header of their own, walking past `ADMIN_IP_ALLOWLIST` and the
login lockout.
[Visitor addresses and proxies](./operating.md#visitor-addresses-and-proxies)
has the table. If you expose the board's port directly with nothing in
front — do not, but if you do — set `TRUSTED_PROXY_HOPS=0` so the header
is ignored outright.

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

- **[Quickstart § Run the installer](./quickstart.md#4-run-the-installer)**
- **[Quickstart § Mail](./quickstart.md#5-mail)** — the answer sheet for
  the provider list. `/admin/settings?group=mail` changes it afterwards
  with no redeploy; the `MAIL_*` variables in the `.env` beside this
  stack override both.
- **[Running a board](./operating.md)** — the operator handbook:
  backups, the CLI, permissions, spam, and the failures that actually
  happen.

## Upgrading

```sh
cd ~/meith/docker
git fetch --tags
git checkout v0.6.0        # the release you are moving to
docker compose up -d --build
```

`migrate` runs first and the others wait for it, so the schema is never
behind the code. **Take a backup first** — migrations are forward-only
and recovery is by restore; see
[backup and restore](./operating.md#backup-and-restore).

That applies **core migrations only**. Plugin migrations run through
`community upgrade` — see
[the operator CLI](./operating.md#the-operator-cli) for how to run it on
this deployment, and [Upgrading a board](./upgrading.md) for how far you
can jump in one go.

## Building somewhere else

On a 1 GB server the Next build can run out of memory. The shortest fix
is to not build at all: every release publishes this project's own image
— multi-arch, boot-tested in every role — so replace each `build:` block
in the compose file with `image: ghcr.io/meith-dev/meith:0.6.0` and
everything else is unchanged.

Pin the exact version: a floating tag turns the next incidental
`docker compose pull` into an unplanned upgrade. Upgrading is then
editing the pin — the same deliberate act as checking out the next tag.
Build on your own machine or in CI and push to your own registry only
when you have patched the source; that is what this route is for.

The image takes `COMMUNITY_ROLE` — `web`, `worker` or `migrate` — so one
image is all three services. That is what makes the roles impossible to
drift apart, and why there is no second Dockerfile.

## Custom boards

Everything above deploys **this board** — the stock one, whatever plugins
and themes `apps/community`'s own `community.config.ts` compiles in.
Installing a third-party plugin does not mean forking this repository:

```sh
curl -fsSL https://www.meith.dev/create-board.sh | bash -s -- <name>
```

scaffolds a small workspace of its own — `package.json`,
`community.config.ts`, `board.plugins.json` — that depends on the
published `@meith/web` and `@meith/cli` packages instead, and comes with
its own deploy kit already written: `Dockerfile`, `docker-compose.yml` and
`.github/workflows/build.yml`, plus a git repository already initialized
and staged. `npx create-meith <name>` does the identical thing for anyone
who already has Node.js and would rather use it, and clicking **Use this
template** on [meith-dev/template](https://github.com/meith-dev/template)
does it with no local tooling at all — GitHub creates the repository and
its first commit directly. See [Consuming the board
from a workspace](./development.md#consuming-the-board-from-a-workspace)
for the mechanism (`forum-web`/`community` — the same bins this
repository's own image is built through, see [the stock
board](./architecture.md#the-stock-board)) and [the plugin
API](./plugin-api.md) for installing a plugin once the workspace exists.

The "server pulls an image; something else builds it" promise this
document stands behind carries over to a custom board, with one
difference: instead of a release publishing `ghcr.io/meith-dev/meith`, an
operator's own GitHub Actions build their own board and push it to their
own registry. Three steps:

1. **Push the scaffolded repository to GitHub.** `create-meith` already
   initialized it and staged every file, so this is a commit and a push,
   not a `git init` — see [Development § Consuming the board from a
   workspace](./development.md#consuming-the-board-from-a-workspace).
   `.github/workflows/build.yml` builds `Dockerfile` on every push to
   `main` and pushes the image to `ghcr.io/<you>/<board>` — the automatic
   `GITHUB_TOKEN` every workflow run already carries is enough; there is no
   secret to add. The run's own **Summary** tab, once it finishes, prints
   the exact image for step 2 and a direct link to the one-time step of
   making the resulting package public — it starts **private**, and
   Coolify's pull fails with an authentication error no operator can act
   on until that is done.
2. **Point Coolify at the scaffolded repository** — a Docker Compose
   resource, that repository as its source, the same mechanics the
   [Quickstart](./quickstart.md#3-set-your-domain-and-deploy) walks through
   step by step for the same scaffold. `docker-compose.yml` is named for
   Coolify's own default, so there is no path to type; it carries the same
   Coolify magic variables `docker/compose.coolify.yml` does for
   `AUTH_SECRET`, `TICK_SECRET` and the database password. The one thing it
   cannot generate is the image step 1's Summary just printed, so the
   operator sets `MEITH_IMAGE` once, in the resource's own environment —
   the compose file refuses to start without it, with a message saying so.
3. **Redeploy, then run `/install`** on the operator's own domain —
   identical to [Quickstart § Run the installer](./quickstart.md#4-run-the-installer).
   Every push to `main` after this rebuilds the image; Coolify's own
   **Redeploy** is what actually pulls it.

No Docker Hub, no paid CI, whatever the board's size: GitHub Actions' free
tier and GHCR are the whole build side, exactly as they are for the
official image.

The scaffolded `Dockerfile`'s `FROM` line pins
`ghcr.io/meith-dev/meith-base:X.Y.Z` — a published, framework-only image
(the `@meith/web`, `@meith/cli` and `@meith/theme-default` dependency
closure, version-locked, no board config and no secret) that this
project's release pipeline rebuilds alongside `ghcr.io/meith-dev/meith`
itself on every release (`docker/Dockerfile.base`). A scaffolded board's
own `Dockerfile` only ever installs its own delta on top of that already-warm
layer — a newly added plugin's own dependency, typically nothing more —
which is what keeps "add a plugin, redeploy" a build of minutes rather than
a cold toolchain build every time. The base image's tag is not written into
the scaffolded `Dockerfile` at all: `FROM` takes it as a build argument,
and `.github/workflows/build.yml` reads the value straight out of
`package.json`'s own `@meith/web` dependency on every build — so an
upgrade is that one line in `package.json`, never a second pin to remember
in `Dockerfile` too; `create-meith`'s own generated README documents the
exact commands.

`@meith/worker` is not published, so a scaffolded board's image carries no
compiled worker binary — its `docker-compose.yml`'s own `worker` service drives
the tick the way [below](#running-the-tick-without-a-second-set-of-credentials)
describes instead: a small loop against `/api/system/tick`, needing nothing
this image does not already expose.

Building nowhere but a laptop is still available, exactly like ["Building
somewhere else"](#building-somewhere-else) above, for an operator who would
rather not use GitHub Actions for the build at all — `MEITH_VERSION` has no
default, so a bare `docker build -t <board> .` fails; the value is the
scaffolded repository's own `@meith/web` dependency in `package.json`, the
same one `.github/workflows/build.yml` reads:

```sh
docker build --build-arg MEITH_VERSION=$(node -p "require('./package.json').dependencies['@meith/web']") -t <board> .
```

## Running the tick without a second set of credentials

The `worker` service holds database credentials, which some operators
would rather only the web server did. The compose file ships an
alternative behind a profile: a small container that calls
`/api/system/tick` over HTTP once a minute, presenting `TICK_SECRET` in
an `Authorization: Bearer` header:

```sh
docker compose --profile curl-tick up -d
```

Enable that **or** `worker`, never both. Running both is harmless — a
task claims its work in the database, so concurrent ticks are safe — but
it is two things doing one job.

## When it goes wrong

| What you see | What it is |
|---|---|
| `AUTH_SECRET must be set`, before any container starts | Compose itself refusing to interpolate: `.env` is not beside the compose file, or you ran `docker compose` from another directory. |
| `TypeError: Invalid URL` from `migrate` | A `/` or `+` in `POSTGRES_PASSWORD`. Generate it with `openssl rand -hex 32`. |
| `migrate` exits non-zero | Read its log. A failed migration stops the stack on purpose rather than serving against a half-applied schema. |
| Worker logs `worker started` every few seconds | It is crash-looping. `docker compose logs worker` shows the throw above each restart. |
| 502 from the proxy | The web container is not up, or `PORT` is not `127.0.0.1:3000`. `curl -I http://127.0.0.1:3000/api/health` on the host settles which. |
| 413 on an upload | The proxy's body limit, not the board's. See `max_size` above. |
| Uploads vanish after a redeploy | The `uploads` volume is not mounted. `docker volume ls` and `docker compose config` will show it. |
| The board is reachable on `:3000` as well as `:443` | `PORT` is `3000` rather than `127.0.0.1:3000`. Docker writes its own iptables rules, so `ufw` will not have stopped it. |
| Password reset says "check your inbox" and nothing arrives | Mail is not configured, or the provider is refusing it. `/admin/settings?group=mail` → **Send a test message to me** answers which, and prints the provider's own refusal. |
| Mail arrives, but its links point at the wrong host | `APP_URL` in `.env` is wrong — fix it there and redeploy. |

[Running a board § Troubleshooting](./operating.md#troubleshooting)
covers the failures that are about the board rather than the deployment.

## What you are taking on

Worth being plain about, because this is the route with no panel behind
it:

- **Backups are yours.** Nobody else is taking one. `community backup`
  bundles the database *and* the uploads; the cron and the offsite copy
  are still yours to build. See
  [backup and restore](./operating.md#backup-and-restore), and the
  [disaster-recovery runbook](./disaster-recovery.md) for the day they
  are all you have.
- **Certificates are yours.** Caddy makes it a solved problem, but it is
  a problem you now own.
- **Security updates are yours.** `unattended-upgrades` for the host; a
  checkout of the next release and a rebuild for the board.
- **Uptime is yours.** `restart: unless-stopped` covers a crash and a
  reboot; it does not cover a disk filling up. The compose file caps what
  each container may log, so a crash-loop cannot fill the disk by itself —
  but the database and the uploads still grow, and watching the disk is
  still yours.

In exchange: no platform limits, no per-seat pricing, no vendor reading
your members' posts, and a board you can move to another machine with a
`pg_dump` and a `tar`.

## Why not serverless

The question comes up, so: a board needs a process that outlives a
request, and that is the one thing a function cannot be given at any
price.

Everything else has a workaround with a bill attached — a per-minute
schedule is a plan feature, a disk that survives restarts is an object
store and a second vendor. But the tick is bounded by the function
timeout, a large import cannot hold a function open, and migrations stop
being part of the deploy — so between the code going live and you running
the command, new code is talking to an old schema.

You can run this board on a function, and this project does not test it,
ship a configuration for it, or answer for it. Your own server does all
three by existing, which is why it is the only route documented here.
