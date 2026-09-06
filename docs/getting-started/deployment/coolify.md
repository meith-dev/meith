# Deploy with Coolify

Deploy a board on your own server through the Coolify panel. This guide uses
a board repository created from the Meith template. Coolify builds it on the
server; a prebuilt-image option is included for servers that cannot build it.

You need a server, a domain pointing at its IP address, and a GitHub account.
Keep the server and domain accounts accessible to the community's operators.
For other hosting options, see [Choose a deployment](./index.md).

## 1. Install Coolify

Use a current Coolify release and follow its
[installation guide](https://coolify.io/docs/get-started/installation).
The official installer runs as root:

```sh
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

Open the panel at `http://your-server-ip:8000` and create its first account.
Configure HTTPS for the panel and restrict access to the ports it needs.
The board will use ports 80 and 443 through Coolify's proxy.

## 2. Create your board

On [meith-dev/template](https://github.com/meith-dev/template), choose
**Use this template** and create your board repository. This is the simplest
route if you do not already have a local checkout.

Alternatively, create it locally with Node.js 22 or newer:

```sh
npx create-meith my-board
cd my-board
git commit -m "chore(board): scaffold my-board"
git remote add origin https://github.com/<you>/my-board.git
git push -u origin main
```

Create the empty GitHub repository before adding the remote. The directory
name is separate from the display name you will choose in the installer.

The deployment files are:

| Files | Purpose |
|---|---|
| `Dockerfile`, `docker-compose.yaml` | Build and deploy through Coolify |
| `Dockerfile.prebuilt`, `docker-compose.prebuilt.yaml`, `.github/workflows/build.yml` | Build on GitHub Actions and deploy the resulting image |
| `docker-compose.byhand.yaml` | [Deploy without Coolify](./docker-compose.md) |

For the prebuilt option, wait for **Build and push** in the repository's
**Actions** tab. Its summary gives the image name. Make the GHCR package
public, or configure registry credentials in Coolify so it can pull it.

## 3. Set your domain and deploy

In Coolify, choose **New Resource → Public Git repository**, enter your
repository URL, and check the repository. Use:

| Field | Value |
|---|---|
| Branch | `main` |
| Build pack | Docker Compose |
| Base directory | `/` |
| Compose file | `/docker-compose.yaml` |

Continue, set the board's domain, then deploy. Its DNS record must point at
the server for the proxy to issue a certificate.

For a **prebuilt image**, use `/docker-compose.prebuilt.yaml` instead and set
`MEITH_IMAGE` in the resource's environment to the image printed by the build
workflow. A commit-specific tag selects one build; `:latest` follows the most
recent build of `main` and may change on a redeploy.

The stack contains:

| Service | Expected state |
|---|---|
| `postgres` | Running with board data in the `pgdata` volume |
| `migrate` | Exited with code 0 after applying core migrations |
| `web` | Running, with uploaded files and backups in persistent volumes |
| `worker` | Running a loop that calls the web service's tick endpoint |

The scaffold's worker is an HTTP caller. Scheduled work executes inside
`web`, so check the web logs for task results; the worker logs failed calls.

Coolify generates the database password, `AUTH_SECRET`, and `TICK_SECRET`
and supplies the board's `APP_URL`. Check that the URL is your public HTTPS
origin. Save the generated secrets as described in step 6.

The Compose file exposes no host ports. Its resource limits can be changed
through `WEB_MEM_LIMIT`, `WEB_CPUS`, `POSTGRES_MEM_LIMIT`, `POSTGRES_CPUS`,
`WORKER_MEM_LIMIT`, and `WORKER_CPUS`.

**Plan for a brief interruption on redeploy.** Coolify does not support
[rolling updates for Docker Compose deployments](https://coolify.io/docs/knowledge-base/rolling-updates).
The readiness healthcheck helps detect a failed start; it does not make this
Compose deployment a rolling deployment.

## 4. Run the installer

Open `https://your-domain/install`.

1. Resolve any preflight **blockers**. Review **warnings** before proceeding.
2. Unlock the installer with the deployment's **`AUTH_SECRET`**. In Coolify,
   this is the value of `SERVICE_BASE64_64_AUTH` in the resource's environment.
   The unlock lasts 30 minutes in that browser and is also required for restore.
3. Enter the board's name and your administrator account details. Choose your
   own posting name; role names such as `admin` and `moderator` are reserved.
4. Configure mail using step 5. If you provide mail settings, the installer
   sends a test to your address before it writes the installation data.
5. Select **Install**.

The installer checks the schema, saves the initial settings, creates your
administrator account and a first forum, then seals itself. It does not
apply migrations: the `migrate` service must already have completed. After
installation, `/install` returns 404.

Sign in with the new account. Opening `/admin` asks for your password again
because the admin panel has its own session. Continue with
[Set up your community](../first-steps.md) after completing the backup checks.

## 5. Mail

Configure mail in the installer, or later at `/admin/settings?group=mail`.
Without a sending provider, messages go to the container log and are not
delivered. Password reset and email activation need working mail.

### Pick the provider you already have

The installer offers presets for common providers:

| Provider | Information you supply |
|---|---|
| Existing mailbox or another SMTP server | SMTP host, sender address, and the provider's sending credentials |
| Resend API | Sender address and API key |
| Resend SMTP | Sender address and API key as the password |
| Brevo SMTP | Sender address, SMTP login, and SMTP key |
| Postmark SMTP | Sender address and Server API token as username and password |
| Amazon SES SMTP | Sender address, regional endpoint, and SMTP credentials |
| Another JSON API | Sender address, endpoint, and token; it must accept the HTTP driver's message format |

Use the provider's instructions for domain verification and sending
credentials. An existing mailbox does not guarantee that every sender
address on its domain is authorised.

### The installer proves it before writing anything

When you configure mail during installation, Meith sends a test before
writing the board settings or creating the administrator. A failed test
leaves the form available for correction. The schema was already migrated
during deployment.

### If you skipped it

At `/admin/settings?group=mail`, choose the transport, enter the settings,
and **Save**. Then choose **Send a test message to me** and confirm delivery.
The test uses the saved settings.

Check **Activation method** at `/admin/settings?group=registration` before
opening registrations. Do not require email confirmation until mail works.
Environment `MAIL_*` values override the corresponding panel configuration;
see [Mail](../../guides/operations/operating.md#mail) if a saved change is not used.

## Installing a plugin or theme

Follow [Installing plugins and themes](../../customization/installing.md)
in your board checkout. Commit and push the change, then redeploy. With the
prebuilt option, wait for the image build to finish before redeploying.

Apply pending plugin migrations through **Admin → System → Version & migrations**
or `meith upgrade`. Core migrations run in the deployment's `migrate` service.

## Running commands (the CLI) without SSH

Open the resource's **Terminal**, choose the `web` container, and run:

```sh
meith env:check
meith settings:get board.name
meith --help
```

These commands act on the deployed board. `plugin:add` belongs in the board
checkout because it edits files that must be rebuilt; it refuses to run in
the deployed container.

**Admin → System** also offers search reindexing, recounting, cache clearing,
and pending plugin migrations. See [Server operations](../../guides/operations/operating.md)
for command details and account recovery.

## 6. Set up backups

Use Meith's backup system to include both the database and uploaded files.
A database-only backup does not contain attachments, avatars, or board images.

### First, copy the generated secrets off this server

Save these values from Coolify's environment in the community's password manager:

- `SERVICE_BASE64_64_AUTH` — the board's `AUTH_SECRET`.
- `SERVICE_BASE64_64_TICK` — the board's `TICK_SECRET`.
- `SERVICE_PASSWORD_POSTGRES` — the database password.

Backup bundles do not include these environment secrets. In particular,
restoring without the original `AUTH_SECRET` leaves sealed credentials and
authenticator enrolments unreadable.

### Turn on the schedule

1. Open **Admin → Settings → Backups**.
2. Set **Automatic backups** to daily, choose a quiet time in UTC, and choose
   how many bundles to keep. Seven daily bundles keep a week's restore points.
3. Save, then open **Admin → System → Backups** and choose **Back up now**.
4. Check the bundle and its result under **Recent runs**.

The Compose file mounts `/backups` as a persistent volume. Every bundle
includes uploads, so allow enough disk space for the chosen retention.
Scheduled backup work runs through the HTTP tick inside `web` on this route.

### Then ship the bundles off the server

Choose an S3-compatible bucket or WebDAV folder under **Admin → Settings →
Backups**, enter its details, and use **Test the destination**. Run another
backup and verify that it appears off-site.

For credentials supplied through the deployment, use the `BACKUP_S3_*` or
`BACKUP_WEBDAV_*` variables instead and redeploy. Keep the backup destination
separate from the upload store. See [Backups](../../guides/operations/backups.md)
for the required fields, retention, and incomplete-bundle handling.

## 7. Prove the restore

Test on a separate database and uploads directory before relying on a backup.
Follow [Disaster recovery — rehearsal](../../guides/operations/disaster-recovery.md#rehearse-it-and-write-the-number-down)
for the procedure. Verify that a restored account can sign in, a thread
opens, and an attachment downloads. Record the result somewhere off the server.

## Restoring for real

Restore to a fresh deployment using [Disaster recovery](../../guides/operations/disaster-recovery.md#under-coolify).
Set the saved secrets before the first deploy, unlock `/install` with
`AUTH_SECRET`, and choose a backup. Do not run the new-board installation
form on a destination you intend to restore into.

For rollback after an upgrade, also read
[Downgrades](../../guides/operations/upgrading.md#downgrades). Reverting the
image does not undo database migrations.

## If the install fails halfway

Read the step report. If no administrator was created, correct the failure
and retry. If an account already exists, preflight blocks another installation;
use [Account recovery](../../guides/operations/operating.md#account-recovery)
for a working board whose administrator cannot sign in.

Do not reset a database that already holds community content to rerun the installer.

## When something else goes wrong

| Symptom | Check |
|---|---|
| Prebuilt deployment says `MEITH_IMAGE` is missing | Set it on the resource using the image build's summary |
| Image pull is denied | GHCR package visibility or Coolify's registry credentials |
| Build runs out of memory | Build elsewhere and use the prebuilt option |
| `migrate` exits non-zero | Its log; `web` waits for successful core migration |
| Installer asks for a secret | Enter `SERVICE_BASE64_64_AUTH`, not your account password |
| Worker repeatedly logs `tick failed` | Web logs, readiness, and the shared tick secret |
| Upload returns 413 | Proxy and application upload limits |
| Password-reset mail does not arrive | Saved mail configuration and its test button |
| Scheduled work is delayed | Worker status and **Admin → System** task results |

See [Operations troubleshooting](../../guides/operations/operating.md#troubleshooting)
for application failures.

## Next

- [Set up your community](../first-steps.md).
- [Server operations](../../guides/operations/operating.md).
- [Upgrade Meith](../../guides/operations/upgrading.md).
