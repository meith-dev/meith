# meith-board

A community board built on [Meith](https://github.com/meith-dev/meith).

## Choose a deployment

| Route | File | Where the image builds |
|---|---|---|
| Quick start with Coolify | `docker-compose.yaml` | Your server |
| Advanced / prebuilt | `docker-compose.prebuilt.yaml` | GitHub Actions or another build machine |
| Docker Compose without a panel | `docker-compose.byhand.yaml` | Your server |

Use one route for a deployment. The [Coolify guide](https://github.com/meith-dev/meith/blob/main/docs/operations/coolify.md) and [Docker Compose guide](https://github.com/meith-dev/meith/blob/main/docs/operations/docker-compose.md) cover prerequisites, secrets, domains and recovery.

### Quick start with Coolify

1. Push this repository to GitHub.
2. Create a Git repository resource in Coolify with the Docker Compose build pack and `/docker-compose.yaml` as the Compose file.
3. Assign the board's domain and deploy. Coolify supplies database and authentication secrets; save a protected recovery copy.
4. Confirm `postgres` is healthy, `migrate` exits successfully, and `web` and `worker` run.
5. Open `/install`, unlock with `AUTH_SECRET`, and create the board and its first administrator. The installer seals itself and returns 404 after completion.

A push alone does not rebuild this route. Use Coolify's **Redeploy** after pushing. If the server cannot complete the build, use the prebuilt route.

### Advanced / prebuilt

1. Let `.github/workflows/build.yml` finish in GitHub Actions. It builds and publishes your board's image.
2. Make that image accessible to Coolify and select `/docker-compose.prebuilt.yaml`.
3. Set `MEITH_IMAGE` to the exact image from the workflow summary. The commit tag uses `${{ github.sha }}`; `:latest` follows later builds and can change on redeploy.
4. Deploy and complete `/install` as above.

For a local image build, the build argument comes from the board's pinned package:

```sh
docker build -f Dockerfile.prebuilt --build-arg MEITH_VERSION=$(node -p "require('./package.json').dependencies['@meith/web']") -t meith-board .
```

After changing the board, wait for its new image and update `MEITH_IMAGE` if pinned to a commit, then redeploy.

## Run locally

```sh
npm install
npm run dev
```

Open `http://localhost:3000`. Without `DATABASE_URL`, this is a read-only fixture preview. For persistent registration and posting, follow [Create a writable local board](https://github.com/meith-dev/meith/blob/main/docs/operations/local-board.md).

## Configure the community

- `meith.config.ts` registers themes and board configuration.
- `board.plugins.json` and `meith.plugins.ts` register installed plugins.
- `/admin` manages forums, members, permissions and settings.
- `npm run meith -- --help` lists operator commands.

Before inviting members, [test email delivery](https://github.com/meith-dev/meith/blob/main/docs/operations/mail.md), verify [scheduled work](https://github.com/meith-dev/meith/blob/main/docs/operations/scheduled-tasks.md), and [configure backups](https://github.com/meith-dev/meith/blob/main/docs/operations/backups.md). The log mail driver delivers nothing. This deployment's worker calls the web application's tick endpoint. For a manual development run, use `npm run meith -- task:run`.

## Install an extension

Add a plugin from this checkout:

```sh
npm run meith -- plugin:add @meith/plugin-dues
```

Commit the package and registry changes, build and deploy, then apply plugin migrations with `meith upgrade` against the deployed board. Follow [Install plugins and themes](https://github.com/meith-dev/meith/blob/main/docs/operations/installing.md) for the full procedure and theme registration. Installing a package into a running container does not make it part of the next deployment.

## Upgrading

`.github/workflows/update.yml` checks weekly and opens an update pull request. It also supports **Run workflow**. Enable **Allow GitHub Actions to create and approve pull requests** under **Settings → Actions → General**.

Review the release notes, take a backup, and inspect any scaffold files the updater left for manual reconciliation. Merge, rebuild and redeploy; then run `meith upgrade` for plugin migrations. Core migrations run through the deployment's migration service. Migrations are forward-only; recovery uses a backup.

To prepare the update locally:

```sh
npx create-meith@latest update
```

The updater moves package pins and supported deployment files together. Its package update includes these commands; running them alone does not update deployment files:

```sh
npm install --save-exact @meith/web@latest @meith/cli@latest @meith/theme-default@latest
npm install --save-exact next@$(node -p "require('./node_modules/@meith/web/package.json').dependencies.next")
```

Keep Next.js aligned with `@meith/web`. Use `--save-exact`: a caret range is not a legal Docker image tag. Read [Upgrade Meith](https://github.com/meith-dev/meith/blob/main/docs/operations/upgrading.md) before applying the change.
