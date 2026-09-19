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

The marketing site runs at <http://localhost:3100>. The homepage uses a neutral canvas, restrained typography and brief copy, with links to the live forum and dedicated audience guides. Below the audience guides, an ownership section sets out what a community keeps control of — its domain, server, database and roles. Customisation links explain how to build themes and plugins, and the marketplace provides starting points; first-party themes are examples of what the theme system supports. Keep detailed setup and product explanations in the documentation.

The shared header links to Who it’s for, Marketplace, Docs, About and Community — each a page of its own, rather than a jump to a homepage section. Its colour control cycles through System, Light and Dark; explicit choices persist in the browser. The mobile menu closes after navigation, Escape, outside interaction or a switch to the desktop layout.

Social share cards are generated at `/og` and the matching routes under each section, sharing one editorial card built in `src/og/`. The homepage card carries the same wording as the hero; keep them in step when the hero copy changes.

## 4. Validate the change

Run the relevant checks from [Testing](testing.md). Format only files you touched.

For marketing site changes, run `pnpm exec playwright test --config apps/web/e2e/playwright.config.ts`. This starts the site on port 3100 and checks audience navigation, colour preference persistence, mobile navigation and page layouts. The board's `pnpm test:e2e` and `pnpm site:shots` use their own servers and configurations.

Before opening a pull request:

```sh
pnpm verify
pnpm comments:check
```

Keep documentation in step with behavior. Explanations belong in docs, not inline code comments. [Repository rules](repository-checks.md) explains the enforced checks; [Documentation maintenance](documentation.md) explains the publishing workflow.

## 5. Submit a focused pull request

Use a Conventional Commit title such as `fix(posts): preserve attachments when editing`. Describe the behavior change, relevant tests and limitations. Leave package versions unchanged; maintainers use the [release procedure](release.md).
