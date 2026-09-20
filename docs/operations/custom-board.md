# Create a custom board from the stock image

`board:eject` creates a repository matching the running image's exact release and plugins. It does not migrate the database. Back up first and retain the existing database, upload mounts and secrets when changing deployments.

## Export the workspace

From the existing Compose directory:

```sh
mkdir my-board
docker compose run --rm --user "$(id -u):$(id -g)" \
  -v "$PWD/my-board:/data/my-board" \
  web meith board:eject /data/my-board
```

The bind mount preserves output after the container exits. Creating it first and using the host UID/GID avoids ownership errors. The destination must be empty.

Output includes exact package pins, board configuration, plugin registry and source/prebuilt/by-hand deploy files.

## Publish and deploy

```sh
cd my-board
git init
git add -A
git commit -m "chore(board): export stock board"
```

Push to an empty repository. The generated workflow builds an image on `main`. In Coolify, select the repository, use `docker-compose.prebuilt.yaml` and set `MEITH_IMAGE` to that build. Alternatively, build on the server with `docker-compose.yaml`.

Preserve connection strings, upload volumes, `AUTH_SECRET`, tick and mail settings. Check sign-in and attachments after deployment.

Use npm for subsequent package changes; see [Configuration](configuration.md). Add plugins through [Extension installation](installing.md).
