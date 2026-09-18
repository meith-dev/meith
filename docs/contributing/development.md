# Contribute to Meith

Use this guide to run the Meith source repository and prepare a change. You need Node.js 22 or newer and pnpm 10. A generated board uses a different workflow; use [local board setup](../operations/local-board.md) if you are configuring your own community.

## 1. Run the repository

```sh
git clone https://github.com/meith-dev/meith.git
cd meith
pnpm install
pnpm dev
```

Open <http://localhost:3000>. Without a database, this runs the sample board in fixture mode. It is suitable for browsing and presentation work, but does not save writes.

## 2. Enable writes when needed

For posting, installation or moderation work, start the development database:

```sh
docker compose -f docker/compose.dev.yml up -d
cp .env.example .env
```

In `.env`, set `DATA_SOURCE=postgres`, `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/community_test`, and an independently generated `AUTH_SECRET` of at least 32 characters. `openssl rand -hex 32` generates a suitable secret. Keep the file out of git.

```sh
pnpm meith migrate
pnpm dev
```

Open `/install`, unlock it with `AUTH_SECRET`, and complete installation. Stop the development database before running the browser suite: both use port 55432.

> [!CAUTION]
> `docker compose -f docker/compose.dev.yml down -v` deletes the development volume and its data. Use ordinary `down` to stop it without deleting data.

## 3. Find the code to change

| Work | Location or guide |
|---|---|
| Business behavior | Domain packages under `packages/` |
| Pages, forms and request handling | `apps/community`; [Next.js conventions](nextjs-conventions.md) |
| Database and infrastructure | `packages/db`, `packages/drivers`, `packages/runtime` |
| Shared interface components | `packages/ui`; [UI conventions](ui-conventions.md) |
| Themes and plugins | [Build extensions](../extensions/extensions.md) |
| Marketing and docs website | `apps/web`; start it with `pnpm site:dev` |
| Packaging and generated boards | [Board workspaces](board-workspaces.md) |

Read [Architecture](architecture.md) and the repository's `AGENTS.md` before editing. Domain packages do not import application or infrastructure internals.

The site's Community links use `site.forum` and open [forum.meith.dev](https://forum.meith.dev), the live community running from its own template repository. Fixture boards are read-only development and screenshot previews.

## 4. Validate the change

Run the relevant checks from [Testing](testing.md). Format only files you touched. Before opening a pull request:

```sh
pnpm verify
pnpm comments:check
```

Keep documentation in step with behavior. Explanations belong in docs, not inline code comments. [Repository rules](repository-checks.md) explains the enforced checks; [Documentation maintenance](documentation.md) explains the publishing workflow.

## 5. Submit a focused pull request

Use a Conventional Commit title such as `fix(posts): preserve attachments when editing`. Describe the behavior change, relevant tests and limitations. Leave package versions unchanged; maintainers use the [release procedure](release.md).
