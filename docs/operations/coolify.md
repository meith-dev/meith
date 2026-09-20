# Deploy with Coolify

Deploy a generated board repository with PostgreSQL, persistent uploads and a background worker. Coolify builds and runs the Compose stack on your server.

## 1. Prepare the server

You need:

- A working [Coolify installation](https://coolify.io/docs/get-started/installation) and a connected deployment server.
- A domain such as `forum.example.com` pointing to that server, with ports 80 and 443 reachable for HTTPS.
- A Git repository that Coolify can read.
- Node.js 22+, npm and Git on your computer if you use the scaffold command below.

Use a current Coolify release with support for generated variables in Git-based Compose deployments. Follow Coolify's [Docker Compose guide](https://coolify.io/docs/applications/builds/docker-compose) when connecting the repository.

## 2. Create and push the board

Run on your computer:

```sh
npx create-meith my-board
cd my-board
git commit -m "chore(board): scaffold my-board"
```

The scaffold creates the Git repository on `main`. Create an empty repository on GitHub, replace `YOUR_ACCOUNT` below and push:

```sh
git remote add origin git@github.com:YOUR_ACCOUNT/my-board.git
git push -u origin main
```

Alternatively, create a repository from [meith-dev/template](https://github.com/meith-dev/template). Keep the generated Dockerfiles, Compose files and board configuration in the repository. Keep deployment secrets out of Git.

The default deployment builds on the Coolify server. It does not require a successful GitHub Actions image build or a `MEITH_IMAGE` value. For a server that cannot build the image, use [prebuilt images](#use-a-prebuilt-image).

## 3. Add the Coolify application

In the intended Coolify project and environment, add an application from your Git repository. Authorise access to the repository if it is private, then select the deployment server.

| Setting | Value |
|---|---|
| Build pack | Docker Compose |
| Branch | `main` |
| Base directory | `/` |
| Compose file | `/docker-compose.yaml` |

Save and let Coolify parse the Compose file. It defines four services: `postgres`, `migrate`, `web` and `worker`. Do not create a separate database resource for this setup.

## 4. Set the domain and proxy

Set the domain on **web**, using `https://forum.example.com:3000`. The `:3000` selects the internal container port; visitors use `https://forum.example.com` on the normal HTTPS port. Do not assign public domains to the other services. See [Coolify domain routing](https://coolify.io/docs/core/networking/domains).

The generated Compose file declares `SERVICE_FQDN_WEB_3000` and sets `APP_URL` from `SERVICE_URL_WEB`. Verify that `APP_URL` resolves to the public HTTPS origin, without the internal port. If it does not, set the `APP_URL` entry in `web.environment` to the correct public URL and redeploy.

For a board behind only Coolify's proxy, add this line to the existing `web.environment` list in the repository:

```yaml
- TRUSTED_PROXY_HOPS=1
```

Commit and push the change before deploying. If another proxy or CDN sits in front, use the actual trusted hop count. See [Trusted proxies](web-security.md#trusted-proxies). The generated stack does not publish database or web ports directly on the host.

## 5. Check secrets and storage

Coolify generates these values and reuses them across services:

| Coolify variable | Used as |
|---|---|
| `SERVICE_PASSWORD_POSTGRES` | PostgreSQL password and the password in `DATABASE_URL` |
| `SERVICE_BASE64_64_AUTH` | `AUTH_SECRET`; installer unlock and encrypted settings |
| `SERVICE_BASE64_64_TICK` | `TICK_SECRET`; authentication between worker and web |

Save the generated values in your password manager. Preserve the original `AUTH_SECRET` for backup recovery. Changing the PostgreSQL environment password alone does not change the password inside an existing database volume.

Review the parsed persistent storage:

| Volume | Container path | Contents |
|---|---|---|
| `pgdata` | `/var/lib/postgresql` in `postgres` | PostgreSQL data |
| `uploads` | `/app/.uploads` in `web` and `migrate` | Attachments, avatars and board images |
| `backups` | `/backups` in `web` and `migrate` | Local backup bundles |

These mounts are defined in Compose. Keep them when redeploying; deleting the volumes deletes their data. Local volumes do not provide an off-site backup.

## 6. Deploy and check the services

Select **Deploy** and inspect the deployment log.

| Service | Expected result |
|---|---|
| `postgres` | Healthy |
| `migrate` | Exits with code 0 after applying core migrations |
| `web` | Starts after migration succeeds; readiness check passes |
| `worker` | Remains running and calls the web tick approximately every minute |

An exited `migrate` container is expected. If it fails, resolve its error before starting web. The worker logs failed HTTP calls; actual task execution logs are in `web`. A quiet worker log alone does not prove successful tasks.

From your computer, check the public endpoints:

```sh
curl --fail-with-body https://forum.example.com/api/health
curl --fail-with-body https://forum.example.com/api/ready
```

Both should return HTTP 200 with `ok: true`. Check the response body as well as the status.

Compose redeployments can interrupt service. Coolify's application-level [rolling updates](https://coolify.io/docs/applications/deployments/rolling-updates) do not apply to Docker Compose applications.

## 7. Complete installation

1. Open `https://forum.example.com/install`.
2. Resolve any preflight errors and unlock with the generated `AUTH_SECRET` value.
3. Enter the board name and administrator details. Choose your own username; reserved role names are not ordinary posting names.
4. Configure email and verify the test message. The `log` driver records messages without delivering them.
5. Complete installation and sign in. The installer is then sealed; `/install` returns 404.

If you defer email, configure it at `/admin/settings?group=mail` before requiring email confirmation. Leave `MAIL_DRIVER` unset or `log` to use saved board settings; an explicit SMTP or HTTP driver overrides them. See [Email](mail.md).

Complete [Set up a community](../administration/first-steps.md), including a normal member's registration, posting, attachment and private-forum checks.

## 8. Set up backups

1. Configure an off-site destination under **Admin → Settings → Backups**, or supply the `BACKUP_S3_*` or `BACKUP_WEBDAV_*` variables in Coolify and redeploy.
2. Set the schedule, retention and upload inclusion.
3. Request a backup under **Admin → System → Backups**. Confirm completion and the remote copy.
4. Rehearse a restore into a separate database and upload store.

The generated Compose files pass the backup environment variables to both `web` and `migrate`. Save secrets separately from bundles. Use [Backups and restore](backups.md) for destination fields and recovery commands.

## Use a prebuilt image

Use this route to build in GitHub Actions and pull the result on the Coolify server.

1. Push the board to GitHub and wait for **Build and push** to succeed. The workflow uses the repository's `Dockerfile.prebuilt`.
2. Copy the commit-specific image from the workflow summary, such as `ghcr.io/your-account/my-board:<commit-sha>`.
3. Make the GHCR package public, or configure registry credentials that allow Coolify to pull it.
4. Change the resource's Compose file to `/docker-compose.prebuilt.yaml` and set `MEITH_IMAGE` to that image.
5. Carry any local Compose changes, including proxy trust, into the prebuilt file. Keep the same secrets and persistent volumes.
6. Save, deploy and repeat the service and readiness checks.

For each update, wait for the new workflow run and change `MEITH_IMAGE` to its commit-specific tag. A `latest` tag can select a different build on a later redeploy.

## Maintenance and troubleshooting

Open the resource's Terminal for the **web** container. The deployed CLI is on `PATH`:

```sh
meith env:check
meith task:list
```

Check task timestamps and failures under **Admin → System**. Do not install packages in a running container: update the board repository, commit, push and redeploy. Follow [Install extensions](installing.md) and [Upgrade a board](upgrading.md), including backups and plugin migrations.

| Problem | Check |
|---|---|
| Image build fails | Deployment log and server resources; use the prebuilt route if needed |
| Image pull denied | GHCR visibility, pull credentials and `MEITH_IMAGE` tag |
| Migration fails | `migrate` logs, database health and retained credentials |
| Proxy error or wrong site | Domain belongs to `web`, targets port 3000 and resolves to this server |
| Incorrect links or redirects | Resolved `APP_URL` uses the public HTTPS origin |
| Mail or scheduled work stalls | `worker` is running; inspect task outcomes and `web` logs |
| Uploads disappear after redeploy | The `uploads` volume is still mounted at `/app/.uploads` |

See [Troubleshooting](troubleshooting.md) for application errors and [Disaster recovery](disaster-recovery.md) for a failed host or restore.
