# Board configuration

Use this guide to understand which changes need a deployment and which you
can make in the browser. It applies to a scaffolded board and to
`boards/stock` in the Meith repository.

## The board repository

Four files decide what a board is made of:

- **`package.json`** pins the engine. `@meith/web`, `@meith/cli` and the
  default theme are exact versions, not ranges — Meith’s bundled packages move together, and
  [an upgrade](./operations/upgrading.md) moves them together. Nothing
  updates underneath you.

- **`meith.config.ts`** is the build-time registry. It calls
  `defineForumConfig` with the themes the board ships, which one is the
  default, and the installed plugins. Everything installable is named
  here statically so the bundler can see it and the compiler can check
  it: a production build contains exactly what this file names, and
  nothing discovered by scanning a directory at runtime.

- **`board.plugins.json`** is the plugin manifest — the list `meith
  plugin:add`/`plugin:remove` edit, and that you can edit by hand. In a scaffolded board,
  `npm run meith -- plugin:add <package>` installs the package, updates the
  manifest, and regenerates the registry. Commit and redeploy afterwards.

- **`meith.plugins.ts`** turns that manifest into typed imports for the
  config to consume, and is generated from it: `meith plugin:add` writes it in
  a board (the CLI needs no build tooling to do so), and `pnpm board:gen`
  writes it in the Meith repository, where CI checks the two stay in step.

Registering a theme is the same motion: install its package, add an
entry to the `themes` map in `meith.config.ts`, set `defaultTheme`
if it should be the default, redeploy. The contracts those packages
implement are documented in [Themes](../customization/themes.md) and
[Plugins](../customization/plugins.md), and
[the marketplace](../customization/marketplace.md) lists available extensions and their compatibility.

## What stays out of the repository

Everything the community *does* lives in PostgreSQL and is run from the
browser, by people who never see this repository:

- **The forum tree and who may do what** — created and arranged at
  `/admin/forums`, with the per-forum permission matrix.
  [Forums and permissions](./community/forums.md) is the reference.
- **Groups, promotions and allowances** —
  [Groups and promotions](./community/groups.md).
- **Board settings** — the name, colours, registration policy, spam
  thresholds and the rest of `/admin/settings`, covered across
  [the organiser's guide](./community/organiser-guide.md) and
  [the spam controls reference](./community/antispam.md).
- **Members and content** — accounts, threads, posts, messages, and attachment
  metadata. Uploaded files live in the configured file store.

## Runtime configuration

What connects a build to its environment — `DATABASE_URL`, the base URL,
mail credentials, upload paths — is environment variables, set where you
deploy rather than committed.
[Operations § Configuration](./operations/operating.md#configuration)
covers validation and the main runtime controls. The complete environment
schema is in `packages/core/src/env.ts`, with deployment examples in
`.env.example` and your board's generated `.env.example`.

Without `DATABASE_URL`, development, builds and public read-only previews can use
[fixture mode](../contributing/development.md#fixture-mode). A fixture production
server needs `AUTH_SECRET` and can use the memory queue. A board that stores
member activity requires PostgreSQL, a durable queue and scheduler credentials.
