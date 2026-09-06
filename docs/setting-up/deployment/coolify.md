# Deploying with Coolify

You do not need to be a programmer to set up a Meith board. If you can
rent a server, point a domain at it and follow along, this page takes
you from nothing to a board on your own domain, over HTTPS, in about
twenty minutes. By default Coolify builds the image from your repository
on every deploy; this guide walks that **quick-start** path. An
**advanced/prebuilt** path exists too, where GitHub builds the image and
Coolify only pulls it, for a lighter server build and a faster deploy.
The guide calls it out wherever the two diverge.

[Coolify](https://coolify.io) is a free panel you install on your server
once; everything after that is a browser. It deploys a small board of
your own rather than this repository, so that
[the marketplace](../../developing/marketplace.md) can add a plugin or
theme later with `npm install`. To run the compose file and a reverse
proxy yourself, take [Deploying by hand](./docker-compose.md). To work on
the code, [Development](../../developing/development.md) runs it on your
laptop. To have no server at all, [Running on Vercel](./vercel.md)
deploys onto functions with managed services behind it, at the cost of
four bills, a scheduler whose cadence its plan decides, and a board
spread across four companies. It is deliberately not the default; read
that page first, particularly the section on getting back off again.

**You need:**

| | |
|---|---|
| **A server** | Rented in the community's name, from any provider, for a few euro a month. 4 GB RAM, 2 vCPU, 40 GB disk is comfortable. Ubuntu 24.04 LTS below; any distro Docker runs on is fine. |
| **A domain** | With an `A` record already pointing at the server's IP. The certificate step needs it resolving. |
| **SSH** | Root, once, to install the panel. The terminal appears in step 1 and never again. |
| **A GitHub account** | Free. Your board's own repository lives there, and Coolify builds its image straight from it. On the advanced/prebuilt path GitHub's own runners build the image for you. |

## 1. Install Coolify

SSH into the server as root:

```sh
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

It installs Docker if it is missing and serves its own UI on port
**8000**. Open `http://your-server-ip:8000` and **create the first
account straight away**: that registration page is open until somebody
uses it. Then close the machine down to what is used:

```sh
ufw default deny incoming
ufw allow OpenSSH
ufw allow 80,443/tcp
ufw allow 8000/tcp     # the panel; drop this once it is behind a domain
ufw enable
```

Coolify can serve its own UI over HTTPS on a subdomain of yours, using the
same proxy that will serve your board. Do that before you close 8000.

> [!NOTE]
> **Coolify v4.0.0-beta.411 or newer.** Magic environment variables in a
> compose file from a Git source arrived in that release, and they are
> what make this deploy ask you for nothing. An older existing install
> needs updating first.

## 2. Create your board

Three ways, all ending in a repository on GitHub with the deploy kit in
it:

- **Rather not open a terminal at all?** Click **Use this template** on
  [meith-dev/template](https://github.com/meith-dev/template) and name your
  new repository. GitHub creates it and its first commit. Only this
  step's last paragraph and the note under it apply to you: your
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

Pick `my-board`'s replacement now. It names the directory and the
repository on GitHub, not the board's display name, which the installer
asks for in [step 4](#4-run-the-installer); it only has to be lower-case
with no spaces. The template route asks for it when you click through.

Both commands write an identical small workspace into `./my-board`:
`package.json`, `meith.config.ts`, and a deploy kit carrying **three**
routes onto a server. `Dockerfile` and `docker-compose.yaml` serve the
quick-start path. `Dockerfile.prebuilt`, `docker-compose.prebuilt.yaml`
and `.github/workflows/build.yml` serve the advanced/prebuilt path.
`docker-compose.byhand.yaml` serves [Deploying by
hand](./docker-compose.md). The template repository has the same files.
Each depends on `@meith/web` and `@meith/cli` rather than containing a
copy of this repository; [Consuming the board from a
workspace](../../developing/development.md#consuming-the-board-from-a-workspace)
explains the mechanism. On the quick-start path the other files are never
used: delete `Dockerfile.prebuilt`, `docker-compose.prebuilt.yaml`,
`.github/workflows/build.yml` and `docker-compose.byhand.yaml` whenever
you like.

**If you used curl or npx:** the command also initialized a git
repository in `./my-board` and staged every file. Create an empty
repository on GitHub (**New repository**, no README, no `.gitignore`),
then run the four lines the command printed:

```sh
cd my-board
git commit -m "Scaffold my-board"
git remote add origin https://github.com/<you>/my-board.git
git push -u origin main
```

On the quick-start path nothing else happens here. **On the
advanced/prebuilt path:** `.github/workflows/build.yml` builds
`Dockerfile.prebuilt` on GitHub's runners the moment `main` has
something pushed to it (for the template route, the moment GitHub
creates your repository) and pushes the result to
`ghcr.io/<you>/my-board`, using only the `GITHUB_TOKEN` every Actions run
carries.

> [!IMPORTANT]
> **Advanced/prebuilt path only: wait for that build before moving on.**
> Step 3's advanced variant asks for a value only the finished run knows.
> Open your repository's **Actions** tab; once **Build and push** is green:
>
> 1. Open the run and read its **Summary**.
> 2. Copy the image value it shows for [step
>    3](#3-set-your-domain-and-deploy).
> 3. Follow the Summary's link to the package and check it says
>    **Public**. A build from a public repository usually is. If it says
>    Private: **Package settings** → **Change visibility** → **Public**.
>    Coolify cannot pull a private package, and fails the deploy with an
>    authentication error rather than an explanation.

## 3. Set your domain and deploy

In the panel: **New Resource → Public Git repository**. Paste your
repository's address into **Repository URL** and press **Check
repository**. Coolify opens **Build configuration** underneath. One
field needs changing:

| Field | Value |
|---|---|
| Repository URL | `https://github.com/<you>/my-board` |
| Branch | `main` |
| Build pack | **Docker Compose**, the one field on this screen you have to change |
| Base directory | `/` |
| Compose file | `/docker-compose.yaml`, already correct; your repository's file is named for this default |

Press **Continue**, which creates the resource. Coolify offers a generated
domain and accepts your own. Put yours in, the one whose `A` record points
at this server. There is nothing else to set: `docker-compose.yaml` builds
`web` and `migrate` from `Dockerfile` in your repository, so there is no
image value to paste in.

> [!NOTE]
> **Taking the advanced/prebuilt path instead?** Change **Compose file** to
> `/docker-compose.prebuilt.yaml` before you press **Continue**. Once the
> resource exists, open its **Environment Variables**, add `MEITH_IMAGE`,
> and give it the `:latest` value step 2's Summary printed:
> `ghcr.io/<you>/my-board:latest`. That compose file refuses to start
> without it. `:latest` follows your repository's `main` branch, so
> installing a plugin later is a push and a **Redeploy**. The Summary
> prints a second value beside it, the same image ending in a long commit
> code, which names that one build only. Move `MEITH_IMAGE` to that once
> the board is settled and you want upgrades only when you choose.

> [!IMPORTANT]
> **Tell the board it sits behind one proxy.** `TRUSTED_PROXY_HOPS`
> defaults to `0`, and behind Coolify's proxy every visitor then resolves
> to no address at all, which empties `ADMIN_IP_ALLOWLIST`, the login
> lockout and the audit log's `ip_prefix`. Coolify only hands a compose
> service the variables the file names, and the scaffolded compose files
> do not name this one, so a panel variable alone does nothing. Add
> `- TRUSTED_PROXY_HOPS=${TRUSTED_PROXY_HOPS:-1}` under `web`'s
> `environment` in `docker-compose.yaml` (or
> `docker-compose.prebuilt.yaml` on the advanced path), commit and push.
> From then on `TRUSTED_PROXY_HOPS` on the resource's **Environment
> Variables** overrides it: set it to `2` if a CDN sits in front of
> Coolify's proxy as well. [Count your
> proxies](./docker-compose.md#count-your-proxies) explains the number.

Now deploy, from the resource's own **Actions**, once the domain is in
(and, on the advanced path, `MEITH_IMAGE` too). The quick-start path
builds the image on the server, which takes longer than a pull and can
strain a 2 GB box. Four containers come up, in order:

| Container | What it does |
|---|---|
| `postgres` | The database. A named volume, so recreating the container keeps the data. |
| `migrate` | Applies the schema and **exits 0**. The next two wait for it, so the code never runs against a schema behind it. |
| `web` | The board itself. Uploaded files (avatars, board images, attachments) live in a named `uploads` volume, so a redeploy keeps them. The compose file sets `FILESTORE_DRIVER: local` literally and passes no `S3_*` variables, so a Coolify environment variable cannot move them. To keep uploads outside the server, edit the compose file: set `FILESTORE_DRIVER` to `s3` and pass `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` and, for anything that is not AWS, `S3_ENDPOINT` through under `web` and `migrate`, then redeploy. |
| `worker` | Not the compiled tick process. `@meith/worker` is not published, so a board built this way calls `/api/system/tick` from a small loop instead. The catch-up it triggers runs inside `web`, so `web`'s log, not this container's, is where a long `ran` list shows it working. This container only logs on failure. |

Four things happen without your involvement:

- **The secrets are generated.** `AUTH_SECRET`, `TICK_SECRET` and the
  database password come from Coolify's magic variables, filled in on the
  first deploy and kept for the life of the resource. All three are
  visible in the panel; none is typed.
- **The board is told its own URL** (`APP_URL`), which every link in an
  outgoing e-mail is built against.
- **The certificate is issued and renewed** by Coolify's proxy.
- **Nothing is published on the host**, so the proxy is the only way in.

The same **Environment Variables** tab tunes the containers' resource
ceilings, which default to a small VPS: `WEB_MEM_LIMIT`, `WEB_CPUS`,
`POSTGRES_MEM_LIMIT`, `POSTGRES_CPUS`, `WORKER_MEM_LIMIT` and
`WORKER_CPUS` override the compose file's defaults.

> [!NOTE]
> **Redeploys, and deploying without a gap.** On the quick-start path,
> every **Redeploy** rebuilds `web` and `migrate` from your repository's
> current `main`. On the advanced path those two services set
> `pull_policy: always`, so every **Redeploy** fetches the current image
> for the tag rather than reusing a `:latest` the host already has. Either
> way, Coolify recreates a compose stack by default: it stops the old
> containers before starting the new ones, so the board is briefly down
> while `web` boots. To close that gap, turn on **Rolling update** in the
> resource's **General** settings: `web` declares a `/api/ready`
> healthcheck, and Coolify waits for the new container to pass it before
> retiring the old one.

## 4. Run the installer

Open `https://your-domain/install`. It checks your environment **before**
offering a form, and separates two kinds of problem:

| It says | It means |
|---|---|
| **Blocker** | Installing cannot succeed: a missing variable, an unreachable database. There is no form until it is fixed. |
| **Warning** | Installing will succeed and something will be wrong *later*. |

Everything that passed is folded into an "*N* checks passed" line you can
expand. Read the warnings.

Once the checks pass, the page asks you to **prove you deployed this
board**: paste the board's `AUTH_SECRET` into the unlock form. On Coolify
that is the value of `SERVICE_BASE64_64_AUTH` on the resource's
**Environment Variables**. The unlock lasts 30 minutes in that browser.
Only then does the page show the install form and, when the `backups`
volume or the off-site destination the environment names holds a bundle,
the option to **restore a backup** instead of installing. A board moving
from another server takes that route: [Restoring from the
installer](../../operating/backups.md#from-the-installer) walks it.

The form is three numbered sections: **Your board**, **Your account** and
**Sending mail**. The first two are four boxes between them: what the
board is called, and the name, address and password of your account. It
does not ask for the board's address; Coolify supplies it. The third
section is a **list of mail providers**: pick the one you already have
and it fills in the host, port and TLS mode, leaving you a sender address
and one credential to paste. [Step 5](#5-mail) is the answer sheet for
that list. Mail is the one thing on this form that is harder to add
later than now.

> [!NOTE]
> **Your username is the name you post under**, not a role. `admin` and
> `administrator` are reserved, along with `root`, `moderator`, `mod`,
> `staff`, `system`, `guest`, `anonymous`, `me` and `you`, so no account
> can impersonate the board. The form lists them under the box. Being an
> administrator is a group membership, and your account is put in it.

Pressing Install runs five steps, listed beside the button under **What
installing does**:

1. **Check the schema**: confirms every table the board needs is already
   there, and stops with the names of any that are not. It does not
   migrate; the container entrypoint does that before the board serves
   anything. If it reports missing tables, run `meith migrate` against
   the same database and reload.
2. **Record the board's name and mail settings**, the only settings it
   writes.
3. **Create the administrator**: your account.
4. **Create a first forum**, so the index is not empty.
5. **Disable the installer.**

If you filled in the mail section, a **test message goes to your address
before step 1**, and nothing is installed if it fails.

> [!CAUTION]
> Step 5 is irreversible: `/install` answers 404 from then on, on
> purpose. You are running this against the production database, which is
> the right place. Do not run it twice against two different ones.

Running it twice against the *same* one is safe, including at the same
moment from two browsers. The installer takes a lock on the database and
re-checks the seal inside it: the second attempt is told an install is
already running, or sent to the finished board. It does not migrate a
second time or create a second administrator.

That is a board. Sign in with the account you just made. If the header
still says *Meith* rather than your board's name, wait a minute and
reload: settings are cached briefly. Then go to **`/admin`**, which asks
for your password a second time: the control panel keeps a session of its
own, which lapses after 30 minutes idle and after 8 hours regardless.

## 5. Mail

**This is the answer sheet for section 3 of the installer.** If the board
is already installed, the same settings live at
**`/admin/settings?group=mail`** and take effect on the next message,
with no redeploy either way.

> [!IMPORTANT]
> A board with no mail configured **sends nothing at all**. Each message
> is written to the container log and stops there. Password reset fails
> silently, and if registration asks for a confirmation link, nobody can
> finish signing up. Nobody notices until the first member cannot get
> back in.

### Pick the provider you already have

**How mail is sent** is a list that opens on *Skip for now: this board
sends no mail*, which is the wrong answer for most boards. Every other
row is the ordinary SMTP or API transport with the fiddly half typed in
for you. They are prefills, so anything you type yourself wins over the
preset:

| Choose | It already knows | You give it |
|---|---|---|
| **A mailbox I already have (SMTP)** | Port 465, implicit TLS | Sender address, your provider's SMTP host, your mailbox address as the username, and an app password, never the password you sign in with |
| **Resend (API)** | The endpoint | Sender address and the API key |
| **Resend (SMTP)** | `smtp.resend.com`, 465, implicit TLS, username `resend` | Sender address, and the API key as the password |
| **Brevo (SMTP)** | `smtp-relay.brevo.com`, 587, STARTTLS | Sender address, and Brevo's SMTP login and key |
| **Postmark (SMTP)** | `smtp.postmarkapp.com`, 587, STARTTLS | Sender address, and the server API token as **both** username and password |
| **Amazon SES (SMTP)** | Port 587, STARTTLS | Sender address, `email-smtp.<region>.amazonaws.com`, and SMTP credentials, *not* your AWS access keys |
| **Any other SMTP server** | Port 587, STARTTLS | Sender address, the host, and credentials if the server wants them |
| **Any other JSON API** | Nothing | Sender address, endpoint and key. Works only if the provider takes Resend's exact field names |

Three boxes appear whichever you pick, **Sender address**, **Username**
and **Password or API key**, plus **Server details** for the rows that
still need a hostname. A box left blank uses the preset's own value.

**If you receive mail on this domain already** (Fastmail, Migadu, Google
Workspace, your host's mailbox), take the first row. SPF and DKIM are
already published for the domain and there are **no DNS records to add**.

**Everything else on the list needs the sending domain verified with the
provider first**, and the board cannot do that step for you. Until it is
done, a new account can usually only mail the address you signed up
with, and SES additionally starts in a sandbox that needs a support
request to leave. The installer says which caveat belongs to which
provider; free tiers and deliverability are compared in
[Operations § Mail](../../operating/operating.md#mail).

### The installer proves it before writing anything

Press Install and a real message goes to your address **before the first
migration**, with nothing installed if it fails. A provider that refuses
says why, and that sentence is put on the form word for word: "the
domain example.com is not verified" is the whole answer.

### If you skipped it

Configure it at **`/admin/settings?group=mail`**. Same settings, minus
the provider list: **How mail is sent** there is the transport (*SMTP
server*, or *Provider API*) and you type the host, port and security mode
from the table above. **Save**, then press **Send a test message to me**.
It sends through what is *stored*, so save first, and shows the
provider's refusal verbatim.

Finally, check **Activation method** under
`/admin/settings?group=registration`: it decides whether new members need
a confirmation link at all, and it is the one setting that turns a mail
problem into a board nobody can join.

> None of this is an environment variable. `MAIL_DRIVER` and its
> companions still exist and still win outright when set, for deployments
> configured wholly from files, at the cost of a redeploy to rotate a
> key. See [Operations § Mail](../../operating/operating.md#mail).

## Installing a plugin or theme

Nothing installs into a running container. A plugin or theme has to be
built into the image. In the board repository:

1. Add it. A **plugin** is one command, which installs the package and
   registers it: `npm run meith -- plugin:add <package>`, e.g.
   `@meith/plugin-dues`. A **theme** is
   `npm install --save-exact <package>` (e.g. `@meith/theme-midnight`), then
   an entry in `meith.config.ts`'s `themes` map following the shape of the
   `default` one there, with `defaultTheme` set to its key to make it the
   board's default.
2. `git commit` and `git push`, then press **Redeploy** in Coolify.
   Pushing alone does not rebuild: quick-start builds the new image on
   that redeploy; advanced/prebuilt waits for `.github/workflows/build.yml`
   to finish first, and Redeploy is what pulls the result.
3. If it ships database changes, apply them once it is up from
   **Admin → System** (**Version & migrations**), or
   `docker compose run --rm web meith upgrade`.

[Installing plugins and themes](../../getting-started/installing.md) is the
full guide, and [Plugins](../../developing/plugins.md) and
[Themes](../../developing/themes.md) are the authoring references.

## Running commands (the CLI) without SSH

Most day-to-day maintenance is in the browser admin panel: settings, users,
forums, and, under **Admin → System**, the search reindex, recount, cache
clearing and **applying a release's migrations**. What is left is the `meith`
operator CLI, and Coolify runs it without a shell of your own.

**A one-off command.** Open the board resource's **Terminal** in Coolify,
choose the `web` container, and run `meith <command>` directly:

```sh
meith env:check
meith settings:get board.name
meith upgrade
```

`meith` is on the image's `PATH`. From a plain host shell on the server it
is `docker compose exec web meith <command>` instead. These are
**runtime** commands, acting on the running board and its database.
Installing a plugin or theme edits your board's repository and only takes
effect on a rebuild, so it is done in your checkout, not here;
`plugin:add` refuses in the container for that reason.

**Something recurring.** Add a **Scheduled Task** to the resource: a name,
the command, the container (`web`), and a cron schedule. Coolify runs it in
the container on that schedule, with a button to run it now. Backups do
not need one (see below), but a report you script yourself might.

The [operator CLI reference](../../operating/operating.md#the-operator-cli)
lists every command; `meith --help` inside the container lists what your
installed release has.

## 6. Set up backups

Not optional, and mostly not the panel's job: Coolify's own per-resource
backup schedule dumps the database and does **not** include the uploads
volume (avatars, attachments, board images). The board takes its own
backups, database and uploads together, and the compose file mounts a
named `backups` volume at `/backups` for them, so the bundles survive
every redeploy. Three steps, and the first is not a schedule.

### First, copy the generated secrets off this server

Coolify generated three values on the first deploy and holds them nowhere
but this machine: `SERVICE_BASE64_64_AUTH` (the board's `AUTH_SECRET`),
`SERVICE_BASE64_64_TICK` (`TICK_SECRET`) and `SERVICE_PASSWORD_POSTGRES`
(the database password). Open the resource's **Environment Variables**
and put all three in the community's password manager now. The bundles
deliberately do not contain the secrets, and losing `AUTH_SECRET` with
the server strands every member's authenticator-app enrolment even after
a perfect restore.
[Disaster recovery](../../operating/disaster-recovery.md#what-recovery-consumes)
prices each of the three.

### Turn on the schedule

On the board, **Admin → Settings → Backups**: set **Automatic backups**
to *Every day*, leave the time at 02:00 UTC or pick the board's quietest
hour, keep the retention at 7, and save. That writes a timestamped
bundle, database dump and uploads together, into the `backups` volume
every night, keeping the newest **7**. On a scaffolded board the dump
runs inside `web` on the ordinary tick, not in the `worker` container,
which is only a curl loop. The other tick tasks, the mail outbox
included, wait until it finishes; only the compiled worker in the meith
repository runs backups in a lane of their own.

Then **Admin → System → Backups** and **Back up now**: the bundle appears
in the list within a couple of minutes, with its size, and **Recent
runs** records the run. A run that fails shows there in red, on the
System screen as a failing task, and as a notification to every
administrator.

Each bundle carries every upload, so seven bundles is roughly seven times
the board's data; **Backups to keep** is the knob if the disk gets tight.
A run that skips objects it cannot read is recorded as *done, incomplete*:
[worth understanding](../../operating/backups.md#when-a-bundle-is-incomplete),
not worth discarding.

### Then ship the bundles off the server

The ring on `/backups` shares a disk with the board, so it protects
against a bad upgrade or a deleted forum, not against losing the server.
Name a bucket and every backup also ships its bundle there, pruned to the
same retention:

1. Create a bucket at any S3-compatible provider: Backblaze B2,
   Cloudflare R2, Hetzner, Scaleway, MinIO on a machine you trust. It
   costs a few euro a month at forum size. **A bucket of its own**: never
   the bucket uploads live in, if you moved those to S3. Give its
   credential write, list and delete on that bucket only.
2. Either pick the bucket as the **Off-site destination** under
   **Admin → Settings → Backups** and fill in its fields (the secret is
   stored sealed under the board's `AUTH_SECRET`), or, when the
   credential must not live in the database, set `BACKUP_S3_BUCKET`,
   `BACKUP_S3_REGION`, `BACKUP_S3_ACCESS_KEY_ID` and
   `BACKUP_S3_SECRET_ACCESS_KEY` on the resource's **Environment
   Variables**, plus `BACKUP_S3_ENDPOINT` for anything that is not AWS
   itself (with `BACKUP_S3_REGION=auto` for R2), and `BACKUP_S3_PREFIX` if
   one bucket serves several boards, then **Redeploy**. All four required
   values or none; the environment wins when both are set. The
   environment route is also how a fresh resource finds its bundles
   before it has any settings, which [Disaster
   recovery](../../operating/disaster-recovery.md#under-coolify) leans on.
3. Prove the shipping happened: **Test the destination** on the Backups
   screen lists the bucket, and **Back up now** puts the first bundle in
   it. The list then shows the bundle as both *on the server* and
   *off-site*.

A Nextcloud or a Hetzner Storage Box works in place of the bucket: pick
**A WebDAV folder** as the destination instead, and give it the folder's
address and an app password. [Backups](../../operating/backups.md) is the
full reference: the settings, both kinds of destination, the `meith
backup` command for a Scheduled Task you would rather own, and the
restore.

## 7. Prove the restore

A backup nobody has restored is a file, not a backup. This rehearsal
takes ten minutes in the panel's Terminal and touches nothing the live
board uses. Do it once now, and again whenever the deployment changes
shape.

1. **Terminal → `postgres`**: create a scratch database beside the real
   one.

   ```sh
   createdb -U community rehearsal
   ```

2. **Terminal → `web`**: pick a bundle and restore it into the scratch
   database. `meith restore` refuses to run without an explicit
   `RESTORE_DATABASE_URL` and refuses any database that is not empty, so
   it cannot be aimed at the live board by accident. The substitution
   below reuses the board's connection string with the database name
   swapped.

   ```sh
   meith backup:list --dir /backups
   RESTORE_DATABASE_URL="${DATABASE_URL%community}rehearsal" \
     meith restore /backups/<the newest bundle> --skip-uploads
   ```

   Read what it prints: the backup's date and version, migrations (on a
   fresh bundle: nothing to do), and **the restored post count**, the
   number that tells you the bundle is real. `--skip-uploads` keeps the
   rehearsal off the live uploads directory; the bundle's uploads half is
   validated as part of reading the bundle either way.

3. **Terminal → `postgres`**: drop the evidence.

   ```sh
   dropdb -U community rehearsal
   ```

Note the date and the post count somewhere that is not this server.

## Restoring for real

A restore only ever writes into an empty board, so the restore is always
*replace, then verify*, never patch in place.

**Rolling the board back** after a bad upgrade, a plugin gone wrong, or a
mistake that deleted real content. Warn the members if you can; the board
is down from the drop until the restart.

1. **Terminal → `postgres`**: drop the live database and recreate it
   empty. `with (force)` disconnects the running board, which errors
   until the restart below:

   ```sh
   psql -U community -d postgres -c 'drop database community with (force)'
   createdb -U community community
   ```

2. **Terminal → `web`**: for a full restore including uploads, empty the
   uploads volume first (the restore insists on a fresh directory), then
   restore. When the uploads are fine, keep them and add `--skip-uploads`
   instead:

   ```sh
   find /app/.uploads -mindepth 1 -delete
   RESTORE_DATABASE_URL="$DATABASE_URL" meith restore /backups/<bundle>
   ```

   Restoring a bundle older than the deployed release applies the
   migrations in between itself. Restoring after a bad upgrade should
   instead go back to the release the bundle was taken from: pin
   `MEITH_IMAGE` accordingly, and read
   [Downgrades](../../operating/upgrading.md#downgrades) first.

3. **Restart** the resource, then verify before announcing anything:
   sign in, open a thread with attachments, check
   `/admin/settings?group=mail` still sends. On this compose resource
   the panel's Restart re-runs the deployment from your branch's head;
   the [redeploys note](#3-set-your-domain-and-deploy) explains when that
   also moves the version.

**The server is gone**: follow
[Disaster recovery](../../operating/disaster-recovery.md), which has the
order of operations and the verification list. Its [Under
Coolify](../../operating/disaster-recovery.md#under-coolify) section maps
each step onto a fresh panel, including the one trap worth knowing in
advance: paste your saved secrets over the newly generated ones
**before** the first deploy. On a fresh resource the installer itself
offers the bundles in the bucket, so the restore is a page, not a
terminal.

## If the install fails halfway

The run stops at the first failed step, and the step list beside the
button reopens as **How far it got**, each step marked *done*, *failed*
or *not run*. Read it before pressing Install again.

Most of what stops an install is an **answer**, not a fault: a reserved
username, a password below the form's minimum. Those are refused on the
form itself, with the message beside the box, before any step runs.
Change the answer, retype the passwords, and press Install again.

Sealing is deliberately last, so a failure before it leaves a board you
can fix and retry:

- **It failed before the administrator was created.** Fix the cause and
  run it again. Migrations and the settings step are both safe to apply
  twice.
- **It failed after the administrator was created.** The installer
  refuses to run again: its preflight blocks on *any* account existing,
  so a retry cannot add a second administrator to a board that already
  has members. If the board is genuinely yours to reset, restore the
  empty database, or drop and recreate it, and start again. If the only
  thing missing is administrator access on a board that otherwise works,
  do not reinstall: use the [operator
  CLI](../../operating/operating.md#account-recovery), `meith
  user:promote`.

## When something else goes wrong

| What you see | What it is |
|---|---|
| The deploy fails before any container starts, complaining that `MEITH_IMAGE` is unset | Advanced/prebuilt path only: you skipped setting it before deploying, or it is set on the wrong resource. See [step 3](#3-set-your-domain-and-deploy). That compose file will not guess an image for you. |
| The deploy fails pulling the image, with an authentication error | Advanced/prebuilt path only: the GHCR package is private. See [step 2](#2-create-your-board)'s note on checking its visibility. |
| The build fails on the server, or takes a very long time | Quick-start path: `Dockerfile` installs this board's full dependency closure on the box itself, which can OOM a 2 GB VPS. Move to the advanced/prebuilt path, [step 3](#3-set-your-domain-and-deploy), and let GitHub's runners build instead. |
| `migrate` exits non-zero | Read its log. A failed migration stops the stack on purpose rather than serving against a half-applied schema. |
| The `worker` container logs `tick failed` repeatedly | The board it is calling is not answering. Check `web`'s own log first; the loop container has no logic of its own to break. |
| 413 on an upload | The proxy's body limit, not the board's. Raise it on the resource. |
| Password reset "sent" and never arrives | Mail is not configured, so the message is sitting in the web container's log. Check `/admin/settings?group=mail` and press the test button. |
| Nothing happens on a schedule | The `worker` container is not running, so nothing is calling `/api/system/tick`. See `/admin/system`. |
| The board is on a newer version than you deployed | Quick-start path: every **Redeploy** builds whatever is on `main` right now, working as intended; a push since your last deploy is what the next Redeploy picks up. Advanced/prebuilt path: `MEITH_IMAGE` is on the `:latest` tag step 3 sets, working as intended the same way. Move it to the commit-sha value, [step 3](#3-set-your-domain-and-deploy), if you would rather that never happen unasked. |

[Operations § Troubleshooting](../../operating/operating.md#troubleshooting)
covers the failures that are about the board rather than the deploy.

## Next

The three guides at the top of this table need a browser and nothing
else, so they can go straight to the people doing those jobs.

| You want to | Read |
|---|---|
| Hand it to whoever runs the community | [The organiser's guide](../../using/organiser-guide.md) |
| Hand the queue to the moderators | [The moderator's guide](../../using/moderation-guide.md) |
| Take memberships online | [The memberships guide](../../using/membership-guide.md) |
| Browse and install a plugin or theme somebody else built | [The marketplace](../../developing/marketplace.md) |
| Run the server day to day | [Operations](../../operating/operating.md) |
| Take it from one version to the next | [Upgrading a board](../../operating/upgrading.md) |
| Deploy it without a panel | [Deploying by hand](./docker-compose.md) |
| Deploy it without a server | [Running on Vercel](./vercel.md) |
| Change how it looks | [The theme API](../../developing/themes.md) |
| Add behaviour | [The plugin API](../../developing/plugins.md) |
| Move a MyBB or phpBB forum here | [Migrating from MyBB or phpBB](../../getting-started/migrating.md) |
| Work on Meith itself | [Development](../../developing/development.md) |
