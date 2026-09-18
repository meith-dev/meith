# meith-board

A community board built on [Meith](https://github.com/meith-dev/meith), deployed as Vercel functions.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmeith-dev%2Fvercel-template&project-name=meith-board&repository-name=meith-board&env=AUTH_SECRET%2CCRON_SECRET&envDescription=Two+secrets%2C+generated+rather+than+chosen+%E2%80%94+32+characters+or+more+each.+Everything+else+the+board+reads+from+the+database%2C+cache%2C+blob+store+and+mail+provider+this+form+links.&envLink=https%3A%2F%2Fgithub.com%2Fmeith-dev%2Fvercel-template%2Fblob%2Fmain%2F.env.example&products=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22neon%22%2C%22productSlug%22%3A%22neon%22%2C%22protocol%22%3A%22storage%22%7D%2C%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22upstash%22%2C%22productSlug%22%3A%22upstash-kv%22%2C%22protocol%22%3A%22storage%22%7D%2C%7B%22type%22%3A%22blob%22%7D%2C%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22resend%22%2C%22productSlug%22%3A%22resend-email%22%2C%22protocol%22%3A%22messaging%22%7D%5D&skippable-integrations=1)

## 1. Connect services and set secrets

The deployment template requests Neon PostgreSQL, Upstash Redis, Vercel Blob and Resend. Keep access to these service accounts and review their current limits and pricing.

Generate two independent secrets:

```sh
openssl rand -hex 32
openssl rand -hex 32
```

Use them for `AUTH_SECRET` and `CRON_SECRET`. Each must be at least 32 characters. Keep a recovery copy of the original `AUTH_SECRET`; it seals stored secrets.

The platform derives the following defaults when you have not supplied explicit overrides:

```ini
DATA_SOURCE=postgres
QUEUE_DRIVER=postgres
CACHE_DRIVER=redis
FILESTORE_DRIVER=blob
MAIL_DRIVER=http
```

| Service value | Meith uses it for |
|---|---|
| `DATABASE_URL` | Runtime database connection |
| `DATABASE_URL_UNPOOLED`, falling back to `POSTGRES_URL_NON_POOLING` | `DIRECT_DATABASE_URL` for migrations and installer locks |
| `KV_URL` | `REDIS_URL`; the Redis protocol connection, not the HTTP REST endpoint |
| `BLOB_STORE_ID` | Upload storage authenticated through the deployment identity |
| `RESEND_API_KEY`, `RESEND_EMAIL_DOMAIN` | HTTP mail credentials and sender |

If a required service configuration is missing, Meith refuses to boot rather than guess. Inspect the named variables in the deployment log. See [Vercel configuration](https://github.com/meith-dev/meith/blob/main/docs/operations/vercel-configuration.md) for explicit overrides.

## 2. Deploy and install

The build command is `meith migrate && forum-web build --at-root`. It applies core migrations before building. Keep preview deployments on a separate database if they must not migrate production.

When the deployment succeeds, open `/install`. Unlock with `AUTH_SECRET`, confirm the permanent public board address, and create the first administrator. Installation seals the route; `/install` then returns 404.

## Mail

Mail needs no variables after the deploy when the Resend integration supplies both `RESEND_API_KEY` and `RESEND_EMAIL_DOMAIN`. The default sender is `noreply@` followed by that domain. Verify the sending domain with Resend and send a test from **Admin → Settings → Mail**.

To send from a different address, set `MAIL_FROM` and redeploy. The address must be allowed by your provider. Missing sender configuration can leave mail on the log driver, which delivers nothing.

For another HTTP provider, set `MAIL_DRIVER=http`, `MAIL_HTTP_ENDPOINT`, `MAIL_HTTP_TOKEN` and `MAIL_FROM`; endpoint and token must be supplied together. See [Email configuration](https://github.com/meith-dev/meith/blob/main/docs/operations/mail.md).

## 3. Verify scheduled work and hosting limits

`vercel.json` calls `/api/system/tick` on `0 3 * * *`: once a day. That cadence can delay notifications, search indexing and queued work. Time-sensitive plugin work can miss its useful delivery window.

Choose a cadence supported by your current plan, or use an external scheduler authenticated with an independently generated `TICK_SECRET`. The endpoint accepts `CRON_SECRET` or `TICK_SECRET`. A paid plan may provide more scheduling options; check [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).

The tick declares `maxDuration = 300`. Check the project's Fluid Compute setting and [function duration limit](https://vercel.com/docs/functions/configuring-functions/duration) before deploying; an unsupported duration can fail deployment. Upload limits also come from the platform, regardless of the board's attachment settings.

Inspect task results, not only HTTP status: a tick can return 200 with `ok: false` and failed tasks in `ran`. Follow [Scheduled tasks](https://github.com/meith-dev/meith/blob/main/docs/operations/scheduled-tasks.md) and test real posting, uploads and email before inviting members.

## Upgrading

`.github/workflows/update.yml` opens a weekly update pull request and supports **Run workflow**. Enable **Allow GitHub Actions to create and approve pull requests** under **Settings → Actions → General**.

Read the release notes and take a backup before merging. Vercel redeploys the merged code and applies core migrations during the build. Apply plugin migrations with the operator CLI using the deployment's environment. Migrations are forward-only.

To prepare the update locally:

```sh
npx create-meith@latest update
```

The updater also reconciles supported deployment files. Its package update keeps Meith and Next.js aligned:

```sh
npm install --save-exact @meith/web@latest @meith/cli@latest @meith/theme-default@latest
npm install --save-exact next@$(node -p "require('./node_modules/@meith/web/package.json').dependencies.next")
```

See [Upgrade Meith](https://github.com/meith-dev/meith/blob/main/docs/operations/upgrading.md) for validation and recovery.

## Leaving Vercel

Run backups from a checkout with the correct hosted database credentials and PostgreSQL tools. Set `FILESTORE_DRIVER=blob` and a store's `BLOB_READ_WRITE_TOKEN`; a local CLI cannot use the deployment's identity. Blob backups include uploads **by default**.

With that environment selected and a writable output directory:

```sh
npm run meith -- backup --out ./board-backup.tar.gz --uploads include
```

Check the result and bundle manifest. Preserve the original `AUTH_SECRET` separately. Restore into an empty destination and verify attachments and sign-in before switching traffic or deleting the old services. Follow [Move away from Vercel](https://github.com/meith-dev/meith/blob/main/docs/operations/leaving-vercel.md) for the complete procedure.
