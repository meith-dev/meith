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

Anything that passed is folded into a "*N* checks passed" line you can open if
you want the roll call. What is on the page is what needs a decision — so read
the warnings. Nearly every way a new board disappoints somebody a month in is
visible on that screen on day one.

If there is a blocker, there is no form: fix it, redeploy if it was an
environment variable, and reload.

Otherwise the form is three numbered sections — **your board**, **your account**,
and **how the board should send mail**. The first two are four boxes between
them. Fill the mail one in here if you can; the reasons are in step 5, and doing
it now costs one extra minute rather than one extra visit.

> [!NOTE]
> **Your username is the name you post under**, not a role. `admin` and
> `administrator` are both reserved — along with `root`, `moderator`, `mod`,
> `staff`, `system`, `guest`, `anonymous`, `me` and `you` — so that no account
> can impersonate the board. The form lists them under the box. Being an
> administrator is a group, and this account is put in it either way.

It does not ask for the board's address. Coolify supplies that (`APP_URL`), so
the installer shows it as already decided rather than asking you to retype your
own domain.

Pressing Install runs five steps. They are listed beside the button under
**What installing does**, and if anything goes wrong the same list reopens as
**How far it got**, marking each one *done*, *failed* or *not run*:

1. **Apply migrations** — every table, index and seeded usergroup.
2. **Record the board's name and mail settings** — the only settings it writes.
3. **Create the administrator** — your account.
4. **Create a first forum** — so the index is not empty.
5. **Disable the installer**.

If you gave it mail, it sends a **test message to your address before step 1**,
and installs nothing at all if that fails. A mistyped API key costs you a retry
on this form rather than a finished board that cannot e-mail anybody.

> [!CAUTION]
> Step 5 is irreversible. `/install` answers 404 from then on, on purpose. You
> are running this against the production database, which is the right place —
> just do not do it twice against two different ones.

That is a board. It sends you to the sign-in page and says so; sign in with the
account you just made.

Then go to **`/admin`**, which asks for your password a second time. That is not
a bug and not a failed sign-in: the control panel keeps a session of its own,
separate from your board session, so an unattended browser that is still signed
in to the board is not also signed in to the panel. It lapses after 30 minutes
idle, and again after 8 hours whatever you are doing.

## 5. Mail

If you filled it in on the installer, a test message already reached your inbox
and there is nothing to do here. Skip to backups.

If you skipped it, do it now at **`/admin/settings?group=mail`**. It takes effect
on the next message — no redeploy, no environment variables.

> [!IMPORTANT]
> A board with no mail configured **sends nothing at all**. Each message is
> written to the container log and stops there. Password reset fails silently,
> and if registration asks for a confirmation link, nobody can finish signing up.
> Nobody notices until the first member cannot get back in.

**Pick whichever of these you already have:**

*You receive mail on this domain already* — Fastmail, Migadu, Google Workspace,
your host's mailbox. This is the shortest path by a distance, because SPF and
DKIM are already published for the domain and there are **no DNS records to
add**:

```
How mail is sent:  SMTP server
Sender address:    an address on that domain
SMTP host:         your provider's SMTP host
SMTP port:         465
SMTP security:     Implicit TLS
SMTP username:     your mailbox address
SMTP password:     an app password — never the password you sign in with
```

*You do not* — use [Resend](https://resend.com), free for 3,000 messages a
month. Set **How mail is sent** to *Provider API*, the endpoint to
`https://api.resend.com/emails`, and paste the API key. You will have to add the
DNS records Resend asks for and wait for them to verify: until that finishes a
new account can only mail the address you signed up with, whatever the board is
configured to do.

**Then press *Send a test message to me*** and read what comes back. A provider
that refuses says why, and that sentence is shown to you word for word — "the
domain example.com is not verified" is the whole answer, and it is the one that
saves the afternoon.

Last, check **Activation method** under `/admin/settings?group=registration`. It
decides whether new members need a confirmation link at all, and it is the one
setting that turns a mail problem into a board nobody can join.

> Prefer to keep the credential out of the database, or configure this
> deployment entirely from files? Mail can come from environment variables
> instead, and they win over this screen when set. That is
> [Running a board § Mail](./operating.md#mail), along with SMTP for every other
> provider.

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

The run stops at the first failed step, and the step list beside the button
reopens as **How far it got** — each step marked *done*, *failed* or *not run*.
That list is the answer to "is it safe to press this again", so read it before
you do.

Most of what stops it is an **answer**, not a fault. "Create the administrator"
runs the board's ordinary registration, so a reserved name, an address already in
use or a password below the board's own minimum all stop the run there. When that
is what happened, the message is repeated beside the box that caused it and the
summary links straight to it — change that one answer, retype the passwords, and
press Install again.

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
