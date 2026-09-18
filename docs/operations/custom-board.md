# Move from the stock image to a custom board

Create a board repository when you need to build extensions into your deployment. The source changes; the existing database, upload storage and secrets must remain connected to the board.

## Moving to a custom board

The stock image is fixed at the version it was built at — nothing can be
installed into a running container, which is exactly why the public
marketplace shows a listing's install steps and links here rather than
offering an install button. Because the stock image is itself built from
a workspace shaped like [`create-meith`](../contributing/board-workspaces.md#the-workspace)'s
own scaffold (see [Quickstart § Create your
board](coolify.md)), graduating to one is generating
those same files from *this build's own state* and repointing the deploy
— the database is untouched, because the board's identity lives in
Postgres, not in the image.

Three steps, nothing beyond a browser, a GitHub account and the server
you already run.

### 1. Eject

This runs inside the stock image, the same way every other operator
command runs (see [Operating a board § The operator
CLI](operator-cli.md#the-operator-cli)) — with two additions this one
needs and no other operator command does, because this is the one that
writes a whole new workspace onto your host rather than only reading or
writing the database:

```sh
mkdir my-board
docker compose run --rm --user "$(id -u):$(id -g)" \
  -v "$PWD/my-board:/data/my-board" \
  web meith board:eject /data/my-board
```

Run it from the same directory you already run `docker compose` in.
Neither addition is optional:

- **`-v "$PWD/my-board:/data/my-board"`** is what makes `/data/my-board`
  land anywhere real. The image declares no volume at `/data`, and `--rm`
  destroys the container's own filesystem — everything eject wrote —
  the moment the command exits, so without a bind mount the workspace
  eject just built is gone before you can use it.
- **`mkdir my-board` first, then `--user "$(id -u):$(id -g)"`** is what
  lets the container actually write into it. The image runs as a fixed,
  non-root account (`nextjs`, uid 1001) that owns nothing on your host;
  creating the mount point yourself, rather than leaving Docker to create
  it, keeps it owned by you instead of root; and `--user` is what makes
  this one-off container run as you too, so the account writing and the
  account owning the directory are the same one. Skip either half and
  eject fails with `EACCES: permission denied`.

`/data/my-board` is the container's own name for the directory it writes
to — on your host, once the command exits, it is `my-board`, exactly
where `mkdir` made it.

`my-board` becomes a complete workspace: `package.json` pinned to
*this image's exact release version* — never `latest`, so graduating is
never a surprise upgrade — the full deploy kit for all three routes onto
a server (`Dockerfile`, `docker-compose.yaml`, `Dockerfile.prebuilt`,
`docker-compose.prebuilt.yaml`, `.github/workflows/build.yml`,
`docker-compose.byhand.yaml`, described
in full in [Quickstart § Create your
board](coolify.md)),
`board.plugins.json` matching what this build actually compiled in, and
`meith.config.ts` matching the stock configuration. Every plugin the
manifest names is also added to `package.json`'s own `dependencies`, at
that same exact version, so the ejected workspace's first build can
actually resolve the imports `meith.plugins.ts` writes for it — a
manifest package `create-meith`'s scaffold already pins (`@meith/web`,
`@meith/cli`, `@meith/theme-default`) is left exactly where it is rather
than duplicated. It refuses to write into a directory that already exists
and is not empty, the same as `create-meith` itself — the empty directory
`mkdir` just made, and that the bind mount leaves untouched, passes.

### 2. Push it to GitHub

`my-board` is a plain directory, not a git repository yet:

```sh
cd my-board
git init && git add -A && git commit -m "Graduate from the stock image"
```

Push it to a new, empty repository on GitHub. No local Docker toolchain
needed from here — `.github/workflows/build.yml`, already written, builds
the image on GitHub's own runners the first time this repository's `main`
branch is pushed to.

### 3. Point Coolify at it and redeploy

From here it is the same three-step advanced/prebuilt deploy
[Quickstart § Set your domain and
deploy](coolify.md)
describes for any scaffolded board: check the GitHub package is public,
point Coolify at the new repository with its **Compose file** field
changed to `docker-compose.prebuilt.yaml`, and set `MEITH_IMAGE` to the
image step 2 just pushed, then redeploy. (The workspace also carries
`Dockerfile` and `docker-compose.yaml` for the quick-start path — Coolify
building the image itself, from the repository — but step 2 already built
one, so there is no reason to build it again on the server; delete the
quick-start pair once you are settled on this path, or leave them.)

### What does not move

- **The database.** `board:eject` never touches it — the same Postgres,
  the same connection string, before and after.
- **Uploads.** Wherever the `uploads` volume already points, it keeps
  pointing there.
- **Every environment variable** — `AUTH_SECRET`, `TICK_SECRET`,
  `DATABASE_URL`, mail settings, all of it. Only where the image comes
  from changes.

Once the redeploy is live, the board is an ordinary workspace — a single
`package.json`, not a pnpm monorepo, so it is `npm install` from here, not
`pnpm add`: `forum-web`'s own startup check (`apps/community/bin/forum-web.mjs`)
requires a hoisted `node_modules`, which pnpm's default isolated linker does
not produce. Installing the plugin that started this is `npm install
<package>` and a line in `meith.plugins.ts` — the same concept [the
plugin API](../extensions/plugins.md) describes for this
repository's own pnpm checkout, just without its workspace machinery —
followed by a commit, a push, and the same redeploy.
