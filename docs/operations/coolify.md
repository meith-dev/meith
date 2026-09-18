# Deploy with Coolify

Deploy a generated board repository on your server through Coolify. You need a working Coolify installation, a domain pointing to the server, and a Git repository Coolify can access.

## 1. Prepare the server and repository

Follow the official [Coolify installation instructions](https://coolify.io/docs/get-started/installation) and secure the panel. Use HTTPS for both the panel and the board.

Create a board from [meith-dev/template](https://github.com/meith-dev/template), or scaffold one locally with Node.js 22 or newer:

```sh
npx create-meith my-board
cd my-board
git commit -m "chore(board): scaffold my-board"
```

Create an empty repository on GitHub, add it as the remote and push your board. Keep access to the repository and hosting accounts available to the community's operators.

## 2. Configure the Coolify resource

Add a Git repository resource and select Docker Compose as its build pack. Point it to the board repository, branch `main`, base directory `/`, and Compose file `/docker-compose.yaml`.

Set the public domain, confirm DNS resolves to the server, and deploy. This route builds the image on the server.

If the server cannot complete the build, use `/docker-compose.prebuilt.yaml` instead. Wait for the board repository's **Build and push** workflow, then set `MEITH_IMAGE` to the image printed in its summary. Make the image accessible to Coolify. A commit-specific tag identifies one build; a moving tag can change on a later redeploy.

## 3. Check the services and secrets

| Service | Expected result |
|---|---|
| `postgres` | Healthy, with a persistent data volume |
| `migrate` | Exited with code 0 after applying core migrations |
| `web` | Running at the public HTTPS address |
| `worker` | Running the HTTP tick loop |

The scaffold worker calls the web service; task execution logs are in `web`. The worker logs failed calls and can otherwise be quiet.

Coolify supplies the database password, `AUTH_SECRET`, `TICK_SECRET` and public URL. Check `APP_URL` and save the generated secrets outside the server. In the resource environment, the generated values are named `SERVICE_PASSWORD_POSTGRES`, `SERVICE_BASE64_64_AUTH` and `SERVICE_BASE64_64_TICK`.

Expect an interruption during a Compose redeploy; a healthcheck does not by itself provide a rolling deployment.

## 4. Complete installation

Open `https://your-domain/install`. Resolve preflight blockers, unlock with `AUTH_SECRET`, and enter the board name and administrator details. Choose your own username; reserved role names are not ordinary posting names.

Configure email and check the test message before completing the installer. With the log driver, messages are logged but not delivered. If you skip mail, configure and test it later under `/admin/settings?group=mail` before requiring email confirmation.

Installation creates the initial board and seals the installer. `/install` then returns 404. Core migrations must already have completed; the installer does not replace the migration service.

## 5. Protect and open the community

Follow [Backups](backups.md) to configure off-site copies and rehearse a restore. Then complete [Set up your community](../administration/first-steps.md).

Use the resource's Terminal for deployed maintenance commands such as `meith env:check`. Package installation belongs in the board checkout, followed by commit, build and redeploy. See [Install extensions](installing.md) and [Upgrade Meith](upgrading.md).

For a failed deployment, inspect the migration result and web logs, then use [Troubleshooting](troubleshooting.md).
