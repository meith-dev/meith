# Quickstart

You do not need to be a programmer to set up a Meith board. This page is
written for whichever volunteer drew the short straw: if you can rent a
server, point a domain at it and paste one command, it takes you from
nothing to a board the whole club can reach — on your own domain, over
HTTPS — in about twenty minutes. Nothing is built on your server: the
deploy pulls the released image.

This is the guided route, and the one most boards should take:
[Coolify](https://coolify.io) is a free panel you install on your server
once, and everything after it is a browser. If whoever minds your machines
would rather run the compose file and a reverse proxy themselves, take
[Deploying by hand](./self-hosting.md) — same board, same image, more
work. If you only want to read the code or write a theme,
[Development](./development.md) runs it on your laptop in two commands.

**You need:**

| | |
|---|---|
| **A server** | Rented in the club's name, from any provider, for a few euro a month. 4 GB RAM, 2 vCPU, 40 GB disk is comfortable. Ubuntu 24.04 LTS below; any distro Docker runs on is fine. |
| **A domain** | With an `A` record already pointing at the server's IP — the certificate step needs it resolving. Your registrar's control panel does this. |
| **SSH** | Root, once, to install the panel. The terminal appears in step 1 and never again. |

## 1. Install Coolify

SSH into the server as root:

```sh
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

It installs Docker if it is missing and serves its own UI on port
**8000**.

Open `http://your-server-ip:8000` and **create the first account straight
away** — that registration page is open until somebody uses it.

Then close the machine down to what is actually used:

```sh
ufw default deny incoming
ufw allow OpenSSH
ufw allow 80,443/tcp
ufw allow 8000/tcp     # the panel; drop this once it is behind a domain
ufw enable
```

Coolify can serve its own UI over HTTPS on a subdomain of yours, using the
same proxy that will serve your board — worth doing before you close 8000.

> [!NOTE]
> **Coolify v4.0.0-beta.411 or newer.** Magic environment variables in a
> compose file from a Git source arrived in that release, and they are
> what make this deploy ask you for nothing. The install script gives you
> the current version; an older existing install needs updating first.

## 2. Point it at the board

In the panel: **New Resource → Docker Compose → Public Repository**.

| Field | Value |
|---|---|
| Repository | `https://github.com/meith-dev/meith` |
| Branch | `release` |
| Compose file | `/docker/compose.coolify.yml` |

`release`, not `main`: the `release` branch moves when a version is
released and at no other time, so what you deploy is a release that has
been built, boot-tested in every role and published — never whatever
`main` held that afternoon. The compose file pulls that release's image
from the registry; your server builds nothing.

> [!IMPORTANT]
> The compose file path is the one field worth checking twice. Coolify
> defaults to `/docker-compose.yml`, which does not exist in this
> repository, so leaving the default fails fast with file-not-found. The
> neighbouring `/docker/compose.yml` is the *other* deployment shape: it
> expects a `.env` you have not written, so picking it stops the deploy
> with `required variable AUTH_SECRET is missing a value`. Either way the
> fix is the file path, not the error it names.

## 3. Set your domain and deploy

Coolify offers a generated domain and accepts your own. Put yours in — the
one whose `A` record points at this server — and press deploy.

The first deploy pulls the image and takes a minute or two. Four
containers come up, in order:

| Container | What it does |
|---|---|
| `postgres` | The database. A named volume, so recreating the container keeps the data. |
| `migrate` | Applies the schema and **exits 0**. The next two wait for it, so the code never runs against a schema behind it. |
| `web` | The board itself. |
| `worker` | The background tick, on its own one-minute loop. Its first tick runs every scheduled task once to catch up — a long `ran` list in that log is it working, not failing. |

Four things happen without your involvement, and they are the reason this
route exists:

- **The secrets are generated.** `AUTH_SECRET` and `TICK_SECRET` come from
  Coolify's magic variables, filled in on the first deploy and kept for
  the life of the resource; so does the database password. All three are
  visible in the panel; none is typed.
- **The board is told its own URL** (`APP_URL`), which every link in an
  outgoing e-mail is built against.
- **The certificate is issued and renewed** by Coolify's proxy.
- **Nothing is published on the host**, so the proxy is the only way in.

### Pin the version, so nothing upgrades this board without you

One more minute here saves a surprise later. The compose file names the
exact version to deploy, and each release moves that pin on the
`release` branch — but Coolify re-reads the file from the branch every
time it deploys the resource, and on this kind of resource the
**Restart** button is a deploy too. Left unpinned, pressing Restart
after a release has come out is an unplanned upgrade, database
migrations included.

So pin it to the resource: open the resource's **Environment Variables**
and add `MEITH_IMAGE`, set to the exact image that just deployed —
`ghcr.io/meith-dev/meith:` and the version, which the deploy log's first
lines print (e.g. `ghcr.io/meith-dev/meith:0.11.0`). That value wins
over the compose file, so from now on every button re-creates the
version you pinned and nothing else. Upgrading becomes a deliberate act
— back up, move `MEITH_IMAGE` to the new version, press Redeploy — and
[Upgrading a board](./upgrading.md#upgrading-each-deployment-route) is
the page for it.

## 4. Run the installer

Open `https://your-domain/install`.

It checks your environment **before** offering a form, and separates two
kinds of problem:

| It says | It means |
|---|---|
| **Blocker** | Installing cannot succeed — a missing variable, an unreachable database. There is no form until it is fixed. |
| **Warning** | Installing will succeed and something will be wrong *later*. |

Everything that passed is folded into an "*N* checks passed" line you can
expand. What is left on the page is what needs a decision — so read the
warnings: nearly every way a new board disappoints somebody a month in is
visible on that screen on day one.

The form is three numbered sections — **Your board**, **Your account** and
**Sending mail**. The first two are four boxes between them: what the
board is called, and the name, address and password of your account. It
does not ask for the board's address on this route — Coolify supplies it,
so the installer shows it as already decided.

The third section is a **list of mail providers**, not a page of server
details: pick the one you already have and it fills in the host, port and
TLS mode, leaving you a sender address and one credential to paste.
[Step 5](#5-mail) is the answer sheet for that list — and mail is the one
thing on this form that is harder to add later than now.

> [!NOTE]
> **Your username is the name you post under**, not a role. `admin` and
> `administrator` are reserved — along with `root`, `moderator`, `mod`,
> `staff`, `system`, `guest`, `anonymous`, `me` and `you` — so no account
> can impersonate the board. The form lists them under the box. Being an
> administrator is a group membership, and your account is put in it
> either way.

Pressing Install runs five steps, listed beside the button under **What
installing does**:

1. **Apply migrations** — every table, index and seeded usergroup.
2. **Record the board's name and mail settings** — the only settings it
   writes.
3. **Create the administrator** — your account.
4. **Create a first forum** — so the index is not empty.
5. **Disable the installer.**

If you filled in the mail section, a **test message goes to your address
before step 1**, and nothing is installed if it fails. A mistyped API key
costs you a retry on this form rather than a finished board that cannot
e-mail anybody.

> [!CAUTION]
> Step 5 is irreversible: `/install` answers 404 from then on, on
> purpose. You are running this against the production database, which is
> the right place — just do not run it twice against two different ones.

Running it twice against the *same* one is safe, including at the same
moment from two browsers. The installer takes a lock on the database
before it does anything and re-checks the seal inside it: the second
attempt is told an install is already running, or — if the first has
finished — sent to the finished board. It does not migrate a second time,
and it does not create a second administrator.

That is a board. It sends you to the sign-in page; sign in with the
account you just made.

If the header still says *Meith* rather than your board's name, wait a
minute and reload — settings are cached briefly, and the name you typed
outlives the cache.

Then go to **`/admin`**, which asks for your password a second time. That
is not a bug: the control panel keeps a session of its own, separate from
your board session, so an unattended browser that is signed in to the
board is not also signed in to the panel. It lapses after 30 minutes
idle, and after 8 hours regardless.

## 5. Mail

**This is the answer sheet for section 3 of the installer**, so read it
before filling that section in. If the board is already installed, the
same settings live at **`/admin/settings?group=mail`** and take effect on
the next message — no redeploy either way.

> [!IMPORTANT]
> A board with no mail configured **sends nothing at all**. Each message
> is written to the container log and stops there. Password reset fails
> silently, and if registration asks for a confirmation link, nobody can
> finish signing up. Nobody notices until the first member cannot get
> back in.

### Pick the provider you already have

**How mail is sent** is a list that opens on *Skip for now — this board
sends no mail*, which is a real answer and the wrong one for most boards.
Every other row is the ordinary SMTP or API transport with the fiddly
half typed in for you — prefills rather than integrations, so anything
you type yourself wins over the preset:

| Choose | It already knows | You give it |
|---|---|---|
| **A mailbox I already have (SMTP)** | Port 465, implicit TLS | Sender address, your provider's SMTP host, your mailbox address as the username, and an app password — never the password you sign in with |
| **Resend (API)** | The endpoint | Sender address and the API key |
| **Resend (SMTP)** | `smtp.resend.com`, 465, implicit TLS, username `resend` | Sender address, and the API key as the password |
| **Brevo (SMTP)** | `smtp-relay.brevo.com`, 587, STARTTLS | Sender address, and Brevo's SMTP login and key |
| **Postmark (SMTP)** | `smtp.postmarkapp.com`, 587, STARTTLS | Sender address, and the server API token as **both** username and password |
| **Amazon SES (SMTP)** | Port 587, STARTTLS | Sender address, `email-smtp.<region>.amazonaws.com`, and SMTP credentials — *not* your AWS access keys |
| **Any other SMTP server** | Port 587, STARTTLS | Sender address, the host, and credentials if the server wants them |
| **Any other JSON API** | Nothing | Sender address, endpoint and key — works only if the provider takes Resend's exact field names |

Three boxes appear whichever you pick — **Sender address**, **Username**
and **Password or API key** — plus **Server details**, for the rows that
still need a hostname. A box left blank uses the preset's own value.

**If you receive mail on this domain already** — Fastmail, Migadu, Google
Workspace, your host's mailbox — take the first row. It is the shortest
path by a distance, because SPF and DKIM are already published for the
domain and there are **no DNS records to add**.

**Everything else on the list needs the sending domain verified with the
provider first**, and the board cannot do that step for you. Until it is
done, a new account can usually only mail the address you signed up
with — and SES additionally starts in a sandbox that needs a support
request to leave. The installer says which caveat belongs to which
provider; free tiers and deliverability are compared in
[Running a board § Mail](./operating.md#mail).

### The installer proves it before writing anything

Press Install and a real message goes to your address **before the first
migration**, with nothing installed if it fails. A provider that refuses
says why, and that sentence is put on the form word for word — "the
domain example.com is not verified" is the whole answer.

That is what makes this a minute now rather than a visit later: a wrong
key found here costs a retry; the same key found afterwards costs a
sealed board that cannot e-mail anybody, fixable only from a panel you
have not seen yet.

### If you skipped it

Configure it at **`/admin/settings?group=mail`**. Same settings, minus
the provider list — that screen is generated from the settings registry,
so **How mail is sent** there is the transport (*SMTP server*, or
*Provider API*) and you type the host, port and security mode from the
table above.

**Save**, then press **Send a test message to me**. It sends through what
is *stored* — so save first — and shows the provider's refusal verbatim.

Finally, check **Activation method** under
`/admin/settings?group=registration`: it decides whether new members need
a confirmation link at all, and it is the one setting that turns a mail
problem into a board nobody can join.

> None of this is an environment variable, and on this route none of it
> needs to be. `MAIL_DRIVER` and its companions still exist and still win
> outright when set — for deployments configured wholly from files, at
> the cost of a redeploy to rotate a key. See
> [Running a board § Mail](./operating.md#mail).

## 6. Set up backups

Not optional, and not the panel's job alone. Two separate things live on
that machine:

- **The database.** Coolify schedules `pg_dump` per resource, with S3 as
  a destination. Turn it on now.
- **The uploads volume.** Avatars and attachments. Coolify's scheduled
  backup does **not** include it, and finding that out during a restore
  is the worst possible time.

[Backup and restore](./operating.md#backup-and-restore) has the commands
for both, and the order they go back in. A backup nobody has restored is
a file, not a backup.

## If the install fails halfway

The run stops at the first failed step, and the step list beside the
button reopens as **How far it got** — each step marked *done*, *failed*
or *not run*. That list is the answer to "is it safe to press this
again", so read it before you do.

Most of what stops an install is an **answer**, not a fault — a reserved
username, a password below the form's minimum — and those are refused on
the form itself, with the message beside the box that caused it, before
any step runs. Change the answer, retype the passwords, and press Install
again.

Sealing is deliberately last, so a failure before it leaves a board you
can fix and retry:

- **It failed before the administrator was created.** Fix the cause and
  run it again — migrations and the settings step are both safe to apply
  twice.
- **It failed after the administrator was created.** The installer
  refuses to run again: its preflight blocks on *any* account existing,
  so a retry cannot add a second administrator to a board that already
  has members. If the board is genuinely yours to reset, recover at the
  database — restore the empty database, or drop and recreate it — and
  start again. If the only thing missing is administrator access on a
  board that otherwise works, do not reinstall: use the
  [operator CLI](./operating.md#the-operator-cli) —
  `community user:promote`.

## When something else goes wrong

| What you see | What it is |
|---|---|
| The deploy fails before any container starts, naming `AUTH_SECRET` or `TICK_SECRET` | Almost always the wrong compose file. It has to be `/docker/compose.coolify.yml` — `/docker/compose.yml` expects a `.env` that does not exist here. |
| `migrate` exits non-zero | Read its log. A failed migration stops the stack on purpose rather than serving against a half-applied schema. |
| The worker logs `worker started` every few seconds | It is crash-looping; the throw is in the log above each restart. |
| 413 on an upload | The proxy's body limit, not the board's. Raise it on the resource. |
| Password reset "sent" and never arrives | Mail is not configured, so the message is sitting in the web container's log. Check `/admin/settings?group=mail` and press the test button. |
| Nothing happens on a schedule | The `worker` container is not running. Every background task is on that loop, and when it stops **nothing errors** — see `/admin/system`. |
| The board is on a newer version than you deployed | **Restart** and **Redeploy** both re-run the deployment from the `release` branch, which a release has moved since. Pin `MEITH_IMAGE` on the resource — [step 3](#pin-the-version-so-nothing-upgrades-this-board-without-you) — and neither button can do it again. |

[Running a board § Troubleshooting](./operating.md#troubleshooting)
covers the failures that are about the board rather than the deploy.

## Next

The board is up, and your part may be done: the three guides at the top of
this table need a browser and nothing else, so they can go straight to the
people doing those jobs.

| You want to | Read |
|---|---|
| Hand it to the committee | [The committee's guide](./committee-guide.md) |
| Hand the queue to the moderators | [The moderator's guide](./moderation-guide.md) |
| Take the subs online | [The treasurer's guide](./membership-guide.md) |
| Run the server day to day | [Running a board](./operating.md) |
| Take it from one version to the next | [Upgrading a board](./upgrading.md) |
| Deploy it without a panel | [Deploying by hand](./self-hosting.md) |
| Change how it looks | [The theme API](./theme-api.md) |
| Add behaviour | [The plugin API](./plugin-api.md) |
| Move a MyBB forum here | [MyBB parity decisions](./mybb-parity.md) |
| Work on Meith itself | [Development](./development.md) |
