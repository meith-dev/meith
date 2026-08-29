# Deploying with Coolify

You do not need to be a programmer to set up a Meith board. This page is
written for whichever volunteer drew the short straw: if you can rent a
server, point a domain at it, and follow along, it takes you from
nothing to a board the whole community can reach — on your own domain,
over HTTPS — in about twenty minutes. By default Coolify builds the image
itself, from your repository, so there is nothing to wait on before your
first deploy, and step 2 offers a route that needs nothing installed on
your own computer at all — not even a terminal. This guide walks that
default, **quick-start** path start to finish; an **advanced/prebuilt**
path exists too — GitHub builds the image ahead of time and Coolify only
ever pulls it, which trades a small amount of setup for a lighter server
build and a faster deploy — and this guide calls it out at each step where
the two diverge.

This is the guided route, and the one most boards should take:
[Coolify](https://coolify.io) is a free panel you install on your server
once, and everything after it is a browser. It deploys a small board of
your own rather than this repository directly — the reason is
[the marketplace](../../customization/marketplace.md): a board built this way is yours from
the first deploy, so a plugin or theme worth installing later is a real
install, not a dead end. If whoever minds your machines would rather run
the compose file and a reverse proxy themselves, take
[Deploying by hand](./docker-compose.md) — same shape, more work. If you only
want to read the code or write a theme, [Development](../../contributing/development.md)
runs it on your laptop in two commands.

And if the server is the part you would rather not have at all, there is a
fourth route: [Running on Vercel](./vercel.md) deploys a board of your own
onto functions, with a managed database, a managed cache and an object
store behind it instead of a machine. Nothing to patch, nothing to back up
by hand, no certificate to renew — at the cost of four bills rather than
one, a scheduler whose cadence its plan decides, and a board spread across
four companies rather than sitting on one box you rent. It is a real
option and deliberately not the default one, and that page is plain about
which parts of it are worse. Read it before picking it, particularly the
section on getting back off again.

**You need:**

| | |
|---|---|
| **A server** | Rented in the community's name, from any provider, for a few euro a month. 4 GB RAM, 2 vCPU, 40 GB disk is comfortable. Ubuntu 24.04 LTS below; any distro Docker runs on is fine. |
| **A domain** | With an `A` record already pointing at the server's IP — the certificate step needs it resolving. Your registrar's control panel does this. |
| **SSH** | Root, once, to install the panel. The terminal appears in step 1 and never again. |
| **A GitHub account** | Free. Your board's own repository lives there, and Coolify builds its image straight from it by default — no software of yours involved. Take the advanced/prebuilt path instead and GitHub's own runners build the image for you. |

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

## 2. Create your board

Three ways to get there — pick whichever matches what you have to hand.
All three end up in the same place: a repository on GitHub with the
deploy kit already in it.

- **Rather not open a terminal at all?** Click **Use this template** on
  [meith-dev/template](https://github.com/meith-dev/template) and name your
  new repository — GitHub creates it and its first commit for you, no local
  anything required, and there is nothing else to do in this step but its
  last paragraph and the note under it. Skip the rest and read those: your
  repository's first build has already started, and [step
  3](#3-set-your-domain-and-deploy) needs what it prints.
- **Have a terminal, nothing installed?**

  ```sh
  curl -fsSL https://www.meith.dev/create-board.sh | bash -s -- my-board
  ```

- **Already have Node.js and reach for `npx`?**

  ```sh
  npx create-meith my-board
  ```

If you used one of the two commands, pick `my-board`'s replacement now —
the name of the directory it writes and, once you push it, of the
repository on GitHub. (The template route asks for this itself, at the
point you click through.) It is not the board's display name (the
installer asks for that later, in [step
4](#4-run-the-installer)), so it does not have to be pretty, only lower-case
with no spaces.

The two commands write an identical small workspace into `./my-board` —
`package.json`, `meith.config.ts`, and a deploy kit of its own, for both
paths this guide covers: `Dockerfile` and `docker-compose.yaml` for the
default quick-start path, `Dockerfile.prebuilt`,
`docker-compose.prebuilt.yaml` and `.github/workflows/build.yml` for the
advanced/prebuilt one — the same files the template repository already
has. Every one of them depends on the published `@meith/web` and
`@meith/cli` packages rather than containing a copy of this repository,
and this is what turns "installing a plugin" from a fork of this project
into `npm install` and a line in a config file — see [Self-hosting § Custom
boards](./docker-compose.md#custom-boards) for the mechanism. Taking the
quick-start path (the rest of this guide) means the advanced-only files
are never used — delete `Dockerfile.prebuilt`,
`docker-compose.prebuilt.yaml` and `.github/workflows/build.yml` whenever
you like, or leave them for later.

**If you used curl or npx:** the command also initialized a git
repository in `./my-board` and staged every file, so the only commands
left are the ones only you can fill in — it prints them back to you,
ready to paste:

```sh
cd my-board
git commit -m "Scaffold my-board"
git remote add origin https://github.com/<you>/my-board.git
git push -u origin main
```

Create that empty repository on GitHub first — **New repository**, no
README, no `.gitignore` — then run the four lines above. (Skip this whole
part if you used the template — GitHub already did it.)

On the quick-start path nothing else happens here — step 3 points Coolify
straight at your repository and it builds `Dockerfile` itself, on every
deploy. **Taking the advanced/prebuilt path instead:**
`.github/workflows/build.yml`, already written, builds `Dockerfile.prebuilt`
on GitHub's own runners the moment `main` has something pushed to it — for
the template route, that means the moment GitHub finishes creating your
repository — and pushes the result to `ghcr.io/<you>/my-board`, using
only the `GITHUB_TOKEN` every Actions run already carries. No Docker on
your computer, no registry account beyond the GitHub account you already
have.

> [!IMPORTANT]
> **Advanced/prebuilt path only — before moving on, wait for that build.**
> Step 3's advanced variant asks you for a value only the finished run
> knows, so there is no starting it early. Open your repository's
> **Actions** tab — **Build and push** is already running, or already
> done — and once it is green:
>
> 1. Open the run and read its **Summary**.
> 2. Copy the image value it shows — you'll paste it into Coolify in
>    [step 3](#3-set-your-domain-and-deploy).
> 3. Follow the Summary's link to the package itself and check it says
>    **Public**. Often it already does — a build from a public repository
>    usually publishes a public package — in which case there is nothing
>    to do. If it says Private, change it here (**Package settings** →
>    **Change visibility** → **Public**) while you are on the page:
>    Coolify cannot pull a private package, and fails the deploy with an
>    authentication error rather than an explanation.

## 3. Set your domain and deploy

In the panel: **New Resource → Public Git repository**. Paste your
repository's address into **Repository URL** and press **Check
repository** — Coolify reads the repository and opens **Build
configuration** underneath, where one field needs changing and the rest
are already right:

| Field | Value |
|---|---|
| Repository URL | `https://github.com/<you>/my-board` |
| Branch | `main` |
| Build pack | **Docker Compose** — the one field on this screen you have to change |
| Base directory | `/` |
| Compose file | `/docker-compose.yaml` — already correct; your repository's file is named for this default |

Then press **Continue**, which creates the resource.

Coolify offers a generated domain and accepts your own. Put yours in — the
one whose `A` record points at this server.

There is nothing else to set: `docker-compose.yaml` builds `web` and
`migrate` from `Dockerfile` in your repository itself, so there is no image
value to look up or paste in. Skip straight to deploying, below.

> [!NOTE]
> **Taking the advanced/prebuilt path instead?** Change **Compose file** to
> `/docker-compose.prebuilt.yaml` before you press **Continue**, then, once
> the resource exists, open its **Environment Variables**, add
> `MEITH_IMAGE`, and give it the `:latest` value step 2's Actions run
> Summary printed — `ghcr.io/<you>/my-board:latest`. That compose file
> refuses to start without it. `:latest` follows your repository's `main`
> branch: installing a plugin later is a push and a **Redeploy**, with
> nothing on this screen to edit — the right trade while the board is young
> and you are still changing it. The Summary prints a second value beside
> it, the same image ending in a long commit code, which names that one
> build and nothing else, ever. Move `MEITH_IMAGE` to that once the board
> is settled and you want upgrades happening only when you choose, not on
> any redeploy — see [Self-hosting § Custom
> boards](./docker-compose.md#custom-boards) when you get there.

Now deploy: the button is on the resource's own **Actions**, and it is the
step everything above was setting up, so leave it until the domain is in
(and, on the advanced path, `MEITH_IMAGE` too). The quick-start path builds
the image on the server, which takes longer than a pull and can strain a
2 GB box; the advanced path only ever pulls one. Either way, four
containers come up, in order:

| Container | What it does |
|---|---|
| `postgres` | The database. A named volume, so recreating the container keeps the data. |
| `migrate` | Applies the schema and **exits 0**. The next two wait for it, so the code never runs against a schema behind it. |
| `web` | The board itself. |
| `worker` | Not the compiled tick process — `@meith/worker` is not published, so a board built this way calls `/api/system/tick` from a small loop instead. The catch-up it triggers still runs inside `web`, so `web`'s log, not this container's, is where a long `ran` list shows it working. This container only logs on failure. |

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

The same **Environment Variables** tab tunes the containers' resource
ceilings, which default to a small VPS: `WEB_MEM_LIMIT`, `WEB_CPUS`,
`POSTGRES_MEM_LIMIT`, `POSTGRES_CPUS`, `WORKER_MEM_LIMIT` and
`WORKER_CPUS` override the compose file's defaults the same way
`MEITH_IMAGE` does on the advanced path, so a larger server is a variable
on the resource, never an edit to the file.

> [!NOTE]
> **Redeploys, and deploying without a gap.** On the quick-start path,
> every **Redeploy** rebuilds `web` and `migrate` from your repository's
> current `main`, so a newly installed plugin is picked up without an
> image to update anywhere. On the advanced path, those two services set
> `pull_policy: always` instead, so every **Redeploy** fetches the current
> image for the tag rather than reusing a `:latest` the host already has —
> a rebuild on `main` is picked up without pinning a new digest. Either
> way, Coolify recreates a compose stack by default: it stops the old
> containers before starting the new ones, so the board is briefly down while
> `web` boots. To close that gap, turn on **Rolling update** for the resource
> (its **General** settings). `web` declares a `/api/ready` healthcheck for
> exactly this — with rolling enabled Coolify waits for the new container to
> pass it before retiring the old one, so the swap carries no downtime.

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

1. **Check the schema** — confirms every table the board needs is already
   there, and stops with the names of any that are not. It does not
   migrate: the container entrypoint and the Vercel build command both do
   that before the board serves anything, so by the time you reach this
   form the work is done. If it does report missing tables, run
   `community migrate` against the same database and reload.
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
[Operations § Mail](../../guides/operations/operating.md#mail).

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
> [Operations § Mail](../../guides/operations/operating.md#mail).

## 6. Set up backups

Not optional, and not the panel's job. Coolify's per-resource schedule
dumps the database and does **not** include the uploads volume — avatars
and attachments — and finding that out during a restore is the worst
possible time. The board's own `community backup` takes both in one
bundle; schedule it as a command on the `web` resource and copy the
bundle off the machine.

[Backup](../../guides/operations/operating.md#backup) has the command and
[Restore](../../guides/operations/operating.md#restore) the way back. A backup nobody has
restored is a file, not a backup.

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
  [operator CLI](../../guides/operations/operating.md#account-recovery) —
  `community user:promote`.

## When something else goes wrong

| What you see | What it is |
|---|---|
| The deploy fails before any container starts, complaining that `MEITH_IMAGE` is unset | Advanced/prebuilt path only: you skipped setting it before deploying, or it is set on the wrong resource — [step 3](#3-set-your-domain-and-deploy). That compose file will not guess an image for you. |
| The deploy fails pulling the image, with an authentication error | Advanced/prebuilt path only: the GHCR package is private — [step 2](#2-create-your-board)'s note on checking its visibility. |
| The build fails on the server, or takes a very long time | Quick-start path: `Dockerfile` installs this board's full dependency closure on the box itself, which can OOM a 2 GB VPS. Move to the advanced/prebuilt path — [step 3](#3-set-your-domain-and-deploy) — and let GitHub's runners do the heavy lifting instead. |
| `migrate` exits non-zero | Read its log. A failed migration stops the stack on purpose rather than serving against a half-applied schema. |
| The `worker` container logs `tick failed` repeatedly | The board it is calling is not answering — check `web`'s own log first; the loop container has no logic of its own to break. |
| 413 on an upload | The proxy's body limit, not the board's. Raise it on the resource. |
| Password reset "sent" and never arrives | Mail is not configured, so the message is sitting in the web container's log. Check `/admin/settings?group=mail` and press the test button. |
| Nothing happens on a schedule | The `worker` container is not running, so nothing is calling `/api/system/tick` — see `/admin/system`. |
| The board is on a newer version than you deployed | Quick-start path: every **Redeploy** builds whatever is on `main` right now, working as intended — a push since your last deploy, adding a plugin say, is what the next Redeploy picks up. Advanced/prebuilt path: `MEITH_IMAGE` is on the `:latest` tag step 3 sets, working as intended the same way; move it to the commit-sha value instead — [step 3](#3-set-your-domain-and-deploy) — if you would rather that never happen unasked, since neither button can do it on its own. |

[Operations § Troubleshooting](../../guides/operations/operating.md#troubleshooting)
covers the failures that are about the board rather than the deploy.

## Next

The board is up, and your part may be done: the three guides at the top of
this table need a browser and nothing else, so they can go straight to the
people doing those jobs.

| You want to | Read |
|---|---|
| Hand it to whoever runs the community | [The organiser's guide](../../guides/community/organiser-guide.md) |
| Hand the queue to the moderators | [The moderator's guide](../../guides/community/moderation-guide.md) |
| Take memberships online | [The memberships guide](../../guides/community/membership-guide.md) |
| Browse and install a plugin or theme somebody else built | [The marketplace](../../customization/marketplace.md) |
| Run the server day to day | [Operations](../../guides/operations/operating.md) |
| Take it from one version to the next | [Upgrading a board](../../guides/operations/upgrading.md) |
| Deploy it without a panel | [Deploying by hand](./docker-compose.md) |
| Deploy it without a server | [Running on Vercel](./vercel.md) |
| Change how it looks | [The theme API](../../customization/themes.md) |
| Add behaviour | [The plugin API](../../customization/plugins.md) |
| Move a MyBB or phpBB forum here | [Migrating from MyBB or phpBB](../../guides/migrating.md) |
| Work on Meith itself | [Development](../../contributing/development.md) |
