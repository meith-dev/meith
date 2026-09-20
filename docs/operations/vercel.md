# Deploy on Vercel

The [Vercel template](https://github.com/meith-dev/vercel-template) uses Neon PostgreSQL, Upstash Redis, Vercel Blob and Resend. Read [Configuration and limits](vercel-configuration.md) first.

1. Use the template's Deploy button to create a repository and connect services.
2. Generate two independent values with `openssl rand -hex 32`; set `AUTH_SECRET` and `CRON_SECRET`. Save a protected recovery copy.
3. Check production and preview database URLs. The build runs migrations; previews must use separate databases if they must not change production.
4. Deploy, open `/install`, unlock with `AUTH_SECRET` and create the administrator. Confirm the permanent public URL and test mail.
5. Configure [scheduled tasks](scheduled-tasks.md). The template's daily cron delays work; use a plan-supported cadence or an external authenticated caller for more frequent ticks.
6. Test registration, reset mail, posting, realistic uploads and private-forum access.
7. Run [backups](backups.md) from an external machine; ordinary functions cannot run the local backup process.

Complete [Community setup](../administration/first-steps.md). Run maintenance commands from a board checkout with the hosted-service environment. See [Move away from Vercel](leaving-vercel.md) for export and restore.
