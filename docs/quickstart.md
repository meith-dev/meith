# Quickstart

From nothing to a board people can reach, on a domain, over HTTPS. About half an
hour, most of it waiting for a build.

This is the guided route: [Coolify](https://coolify.io) on your own server. It
is the shortest path to a real board, and a real board is the only kind worth
setting up — a development server on `localhost:3000` is not something anybody
else can post on.

**You need:**

| | |
|---|---|
| **A server** | Your own, anywhere. 4 GB RAM, 2 vCPU, 40 GB disk is comfortable. Ubuntu 24.04 LTS below; any distro Docker runs on is fine. |
| **A domain** | With an `A` record already pointing at the server's IP. The certificate step needs it resolving. |
| **SSH** | Root, once, to install the panel. Everything after that is a browser. |

Prefer no panel? [Deploying by hand](./self-hosting.md) is the same board from
the same image, with a `.env` you write and a proxy you run. It is the advanced
route, and it is a fair bit more work.

Only want to read the code or write a theme? [Development](./development.md)
runs it on your laptop in two commands.

## 1. Install Coolify

SSH into the server as root:

```sh
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

It installs Docker if it is missing and serves its own UI on port **8000**.

Open `http://your-server-ip:8000` and **create the first account straight away** —
that registration page is open until somebody uses it.

Then close the machine down to what is actually used:

```sh
ufw default deny incoming
ufw allow OpenSSH
ufw allow 80,443/tcp
ufw allow 8000/tcp     # the panel; drop this once it is behind a domain
ufw enable
```

Coolify can serve its own UI over HTTPS on a subdomain of yours, using the same
proxy that will serve your board. Worth doing before you close 8000.

> [!NOTE]
> **Coolify v4.0.0-beta.411 or newer.** Magic environment variables in a compose
> file from a Git source arrived in that release, and they are what make this
> deploy ask you for nothing. The install script gives you the current version;
> an older existing install needs updating first.

## 2. Point it at the board

In the panel: **New Resource → Docker Compose → Public Repository**.

| Field | Value |
|---|---|
| Repository | `https://github.com/meith-dev/meith` |
| Branch | `main` |
| Compose file | `/docker-compose.coolify.yml` |

> [!IMPORTANT]
> The compose file path is the one field worth checking twice. Coolify defaults
> to `/docker-compose.yml`, which is the *other* shape — it publishes a port and
> expects a `.env` you have not written, so it deploys, appears to succeed, and
> is not reachable through the proxy.

## 3. Set your domain and deploy

Coolify offers a generated domain and accepts your own. Put yours in — the one
whose `A` record you pointed at this server — and press deploy.

The first build takes five to ten minutes. Watch the log. Four containers come
up, in order:

| Container | What it does |
|---|---|
| `postgres` | The board. A named volume, so recreating the container keeps the data. |
| `migrate` | Applies the schema and **exits 0**. The next two wait for it, so the code never talks to a schema behind it. |
| `web` | The board itself. |
| `worker` | The background tick, on its own one-minute loop. |

Four things happen without your involvement, and they are the reason this route
exists:

- **The secrets are generated.** `AUTH_SECRET` and `TICK_SECRET` come from
  Coolify's `SERVICE_BASE64_64_*`, filled in on the first deploy and kept for
  the life of the resource. The database password comes from
  `SERVICE_PASSWORD_POSTGRES`. All three are visible in the panel; none is typed.
- **The board is told its own URL**, which is what every link in an e-mail is
  absolute against.
- **The certificate is issued and renewed** by Coolify's proxy.
- **Nothing is published on the host**, so the proxy is the only way in.

## 4. Run the installer

Open `https://your-domain/install`.

It checks your environment **before** it offers you a form, and separates two
kinds of problem:

| It says | It means |
|---|---|
| **Blocker** | Installing cannot succeed. A missing variable, or the database is unreachable. |
| **Warning** | Installing will succeed and something will be wrong *later*. |

Read the warnings. Nearly every way a new board disappoints somebody a month in
is visible on that screen on day one.

Then it runs five steps, naming each before it runs it:

1. **Apply migrations** — every table, index and seeded usergroup.
2. **Record the board's name** — the only setting it writes.
3. **Create the administrator** — your account.
4. **Create a first forum** — so the index is not empty.
5. **Disable the installer**.

> [!CAUTION]
> Step 5 is irreversible. `/install` answers 404 from then on, on purpose. You
> are running this against the production database, which is the right place —
> just do not do it twice against two different ones.

That is a board. Sign in and go to `/admin`.

## 5. Mail

The installer asks for this on the way through, and sends a test message to the
administrator's address before it writes anything — so if you filled it in at
step 4, it already works and you can skip to backups.

If you skipped it, do it now, at `/admin/settings?group=mail`. It takes effect
on the next message; there is no redeploy.

> [!IMPORTANT]
> A board with no mail configured **sends nothing at all** — each message is
> written to the container log and stops there. Password reset fails silently,
> and if registration asks for a confirmation link, nobody can finish signing
> up. Nobody notices until the first member cannot get back in.

**The shortest path, if you already receive mail on this domain** — Fastmail,
Migadu, Google Workspace, your host's mailbox — is SMTP against that mailbox.
SPF and DKIM are already published for the domain, so there are no DNS records
to add: host, port 465, implicit TLS, your address, and an **app password**.

**Otherwise, Resend** is free for 3,000 messages a month and is the first preset
on the screen. You will have to add the DNS records it asks for and wait for
verification — until you do, a new Resend account can only mail the address you
signed up with, whatever the board is configured to do.

Either way, press **Send a test message to me** and read what comes back. A
provider that refuses says why, and that sentence is shown verbatim.

You can also configure mail from the environment instead, which keeps the
credential out of the database; setting `MAIL_DRIVER` there overrides the screen
entirely. In Coolify those go in the resource's **environment variables** and
need a redeploy:

```sh
MAIL_DRIVER=http
MAIL_HTTP_ENDPOINT=https://api.resend.com/emails
MAIL_HTTP_TOKEN=re_…
MAIL_FROM=noreply@your-domain          # on a domain verified with the provider
```

Then check `registration.method` in `/admin/settings`; it decides whether new
members need a confirmation link at all. The full picture, including SMTP in the
environment and what other providers need, is in
[Running a board § Mail](./operating.md#mail).

## 6. Set up backups

Not optional, and not the panel's job alone. Two separate things live on that
machine:

- **The database.** Coolify schedules `pg_dump` per resource, with S3 as a
  destination. Turn it on now.
- **The uploads volume.** Avatars and attachments. Coolify's scheduled backup
  does **not** include it, and finding that out during a restore is the worst
  possible time.

[Backup and restore](./operating.md#backup-and-restore) has the commands for
both, and the order they have to go back in.

A backup nobody has restored is a file, not a backup.

## If the install fails halfway

The run stops at the first failed step and names it, with the error. Later steps
are reported as *not run* rather than as further failures.

Sealing is deliberately last, so a failure before it leaves a board you can fix
and retry. What to do depends on how far it got:

- **It failed before the administrator was created.** Fix the cause and run it
  again. Migrations and the board-name setting are both safe to apply twice.
- **It failed after the administrator was created.** The installer will refuse
  to run again — its preflight blocks on *any* account existing, so a retry
  cannot add a second administrator to a board that already has members.

  If the board is genuinely yours to reset, recover at the database: restore the
  empty database, or drop and recreate it, and start again. If the only thing
  missing is administrator access on a board that otherwise works, do not
  reinstall — use the
  [operator CLI](./operating.md#the-operator-cli): `forum user:promote`.

## When something else goes wrong

| What you see | What it is |
|---|---|
| The deploy succeeds and the domain 404s | Almost always the wrong compose file. It has to be `/docker-compose.coolify.yml`. |
| `AUTH_SECRET must be set` in the migrate log | Same cause: the other compose file expects a `.env` that does not exist here. |
| `migrate` exits non-zero | Read its log. A failed migration stops the stack on purpose rather than serving against a half-applied schema. |
| The worker logs `worker started` every few seconds | It is crash-looping; the throw is in the log above each restart. |
| 413 on an upload | The proxy's body limit, not the board's. Raise it on the resource. |
| Password reset "sent" and never arrives | Mail is not configured, so the message is sitting in the web container's log. Check `/admin/settings?group=mail` and press the test button. |
| Nothing happens on a schedule | The `worker` container is not running. Every catch-up operation is on that loop, and when it stops **nothing errors** — see `/admin` → System health. |

[Running a board § Troubleshooting](./operating.md#troubleshooting) covers the
failures that are about the board rather than about the deploy.

## Next

| You want to | Read |
|---|---|
| Run this board day to day | [Running a board](./operating.md) |
| Take it from one version to the next | [Upgrading a board](./upgrading.md) |
| Deploy it without a panel | [Deploying by hand](./self-hosting.md) |
| Change how it looks | [The theme API](./theme-api.md) |
| Add behaviour | [The plugin API](./plugin-api.md) |
| Move a MyBB community here | [MyBB parity](./mybb-parity.md) |
| Work on Meith itself | [Development](./development.md) |
