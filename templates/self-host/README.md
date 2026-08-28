# meith-board

A forum, built on [Meith](https://github.com/meith-dev/meith).

## Deploy

Nothing here builds on your own server — a 2 GB VPS OOMs on a Next.js build,
which is the whole reason `Dockerfile`, `docker-compose.yaml` and
`.github/workflows/build.yml` exist: something else builds the image, the
server only ever pulls one. Three steps, nothing to configure by hand beyond
one value only you know:

1. **Push this repository to GitHub.** `.github/workflows/build.yml` builds
   `Dockerfile` on every push to `main` and pushes the result to your own
   GitHub Container Registry, `ghcr.io/<you>/meith-board` — using only the
   `GITHUB_TOKEN` every GitHub Actions run already carries. No secret to
   add, no registry account beyond the GitHub account you already have.

   That build is the thing step 2 waits on: open the repository's
   **Actions** tab and let the run finish, because its **Summary** is where
   the exact image to paste into step 2 comes from. The Summary also links
   the package itself, to check it is public — a build from a public
   repository usually lands public already, and a private one fails
   Coolify's pull with an authentication error no operator can act on.

2. **Point [Coolify](https://coolify.io) at `docker-compose.yaml`** — a
   **Public Git repository** resource with **Docker Compose** as its build
   pack, this repository as its source. The name is Coolify's own default,
   so its **Compose file** field is already right when the form opens, and
   the file already carries Coolify's own "magic variables" for
   `AUTH_SECRET`, `TICK_SECRET` and the database password, generated on
   the first deploy and never typed in. The one thing Coolify cannot
   generate is the image step 1 just pushed: set `MEITH_IMAGE` in the
   resource's own environment to one of the two values that run's Summary
   printed (`docker-compose.yaml` refuses to start without it, with a
   message saying why). `ghcr.io/<you>/meith-board:${{ github.sha }}` names
   that one build and nothing else, ever; `ghcr.io/<you>/meith-board:latest`
   follows `main` instead, so installing a plugin later is a push and a
   **Redeploy** — the trade the quickstart takes, at the cost of an
   unrelated redeploy pulling whatever `main` most recently built.

3. **Deploy, then `/install` on your own domain.** Coolify issues the
   certificate; the installer from there is the one
   [docs/getting-started/deployment/coolify.md](https://github.com/meith-dev/meith/blob/main/docs/getting-started/deployment/coolify.md#4-run-the-installer)
   walks through, screen for screen. It seals itself when it finishes, and
   `/install` answers 404 from then on — run it **against the database you
   are going to keep**. Every push to `main` after this rebuilds the
   image; Coolify's own **Redeploy** button is what actually pulls it —
   pushing alone does not.

No Docker Hub, no paid CI: GitHub Actions' free tier and GHCR are the whole
build side of this, for a board of any size.

**Building it yourself**: works on any machine with Docker, if you would
rather not use GitHub Actions for the build — push the result wherever
`docker-compose.yaml`'s `MEITH_IMAGE` can reach.

```sh
docker build --build-arg MEITH_VERSION=$(node -p "require('./package.json').dependencies['@meith/web']") -t meith-board .
```

**Without a panel**: [docs/getting-started/deployment/docker-compose.md](https://github.com/meith-dev/meith/blob/main/docs/getting-started/deployment/docker-compose.md)
is the same four containers by hand — your own `.env`, a reverse proxy you
already run, no Coolify. `Dockerfile` and `docker-compose.yaml` here are this
board's own version of exactly that shape.

Two things nothing configures for you:

- **Mail.** Until `MAIL_DRIVER` and its three settings exist, every message is
  written to the log and delivered to nobody, so password reset fails silently.
- **The tick.** `docker-compose.yaml`'s `worker` service drives it here — a small
  loop calling `/api/system/tick` once a minute, since `@meith/web`'s own
  worker package is not something a board outside the meith monorepo can
  depend on yet. Deploy some other way and something still has to call that
  route (or run `community task:run`) every minute, or nothing catches up
  and nothing errors.

## Local

```sh
npm install
npm run dev
```

No environment file, no database: with no `DATABASE_URL` the board serves
deterministic in-memory sample data, which is enough to click through every
reading surface.

Posting needs Postgres. Copy `.env.example` to `.env.local`, set
`DATABASE_URL` and the two secrets in it, then:

```sh
npm run community -- migrate
echo "<password>" | npm run community -- user:create --username <name> --email <address> --group administrators
```

## Configuring

- **`community.config.ts`** — installed themes and plugins. Everything installable
  is named here so the bundler can see it; nothing is found by scanning a
  directory at runtime.
- **`/admin`** — settings, forums, groups, members, themes, maintenance. An
  administrator re-enters their password to get in, and again for anything
  destructive.
- **`npm run community -- --help`** — the operator CLI. Everything the panel does
  and a few things it cannot, without a browser.

## Upgrading

```sh
npm install --save-exact @meith/web@latest @meith/cli@latest @meith/theme-default@latest
npm install --save-exact next@$(node -p "require('./node_modules/@meith/web/package.json').dependencies.next")
git commit -am "Upgrade Meith and the Next.js version it builds with"
git push
```

The second command is not optional. This board pins `next` itself, and
nothing bumps it for you: upgrading only the `@meith/*` packages leaves the
board's own pin on the old Next while `@meith/web` depends on the new one,
which npm resolves by installing both — the build then runs on one version
while everything reading `package.json` sees the other. Reading the version
out of the freshly installed `@meith/web` is what keeps the two the same
without anybody having to know the number.

This upgrade is deliberate and manual for that reason: `next` and
`@meith/web` move together or not at all. What *is* kept current for you is
this repository's own GitHub Actions — `.github/dependabot.yml` opens a
weekly pull request bumping the actions pinned in
`.github/workflows/build.yml`, which is a safe, independent update the two
commands above never touch.

That `package.json` change is the whole pin: `Dockerfile`'s own
`FROM` line takes the version as a build argument, and
`.github/workflows/build.yml` reads it straight out of `package.json`'s
own `@meith/web` dependency when it rebuilds — nothing in `Dockerfile`
itself to keep in sync by hand. `--save-exact` matters: npm's default
`save-prefix` is `^`, and a caret range is not a legal Docker image tag —
without it, this exact command would write `"^0.18.0"` and the next build
would fail with `invalid reference format` instead of building. This
project's own `.npmrc` sets `save-exact=true` for the same reason, so an
`npm install` of anything else here — a plugin, say — stays pinned too; the
build workflow also refuses to build from anything but an exact version, as
a second line of defense. Once the rebuilt image is deployed, run
`npm run community -- upgrade` against it for the plugin migrations — see
[the operator CLI](https://github.com/meith-dev/meith/blob/main/docs/guides/operations/operating.md#the-operator-cli)
for running it against this deployment.

Migrations are forward-only. Recovery is by restore, so take a backup first —
there is no down migration to undo a destructive one, and a button that pretended
otherwise would be worse than its absence.
