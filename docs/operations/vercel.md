# Deploy on Vercel

Deploy the board web application on Vercel with managed PostgreSQL, Redis, upload storage and mail. Read [Vercel configuration and limits](vercel-configuration.md) before choosing this route, especially its upload and scheduling constraints.

## 1. Create the deployment

Open the Deploy button in the [Meith Vercel template](https://github.com/meith-dev/vercel-template). Create the board repository in your account and connect the services requested by the template.

The standard template uses Neon PostgreSQL, Upstash Redis, Vercel Blob and Resend. Keep access to each service account and understand which one stores the community's data.

## 2. Set independent secrets

Generate two different values:

```sh
openssl rand -hex 32
openssl rand -hex 32
```

Use them for `AUTH_SECRET` and `CRON_SECRET`. Meith requires at least 32 characters for these secrets. Store a protected recovery copy outside the deployment.

Confirm that production and preview environments point to the databases you intend. The template build runs core migrations before building; a preview connected to production can therefore migrate the production schema.

## 3. Deploy and install

Deploy, then open `https://your-deployment/install`. Unlock the installer with `AUTH_SECRET`, review the public URL and mail configuration, and create the administrator account.

The linked services provide environment values from which Meith resolves drivers and credentials. Use the [configuration reference](vercel-configuration.md) if a required value is missing. Do not copy a temporary preview origin into the permanent board URL.

## 4. Arrange scheduled work

The generated template contains a daily cron schedule. A daily tick can leave notifications and queued work delayed; an active community usually needs more frequent execution.

Choose a scheduler cadence supported by your hosting plan, or use an external scheduler to call the authenticated tick endpoint. Follow [Scheduled tasks](scheduled-tasks.md) and verify actual task progress under **Admin → System**. Merely having a cron entry is not proof that tasks are running.

## 5. Verify before inviting members

Check registration and password-reset delivery, posting, attachment upload/download and ordinary-member visibility. Test with realistic attachment sizes; a board setting cannot override the hosting platform's request limits.

Arrange backups from a suitable external machine; serverless functions do not run the board's local backup process. Follow [Backups](backups.md) and retain both database and upload recovery material.

Complete [Set up your community](../administration/first-steps.md). For maintenance commands, run the CLI from a board checkout with the correct hosted-service environment. For moving to a server later, use [Move away from Vercel](leaving-vercel.md).
