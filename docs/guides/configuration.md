# Configuration in code

A Meith board is a small repository. This page is what lives in it, what
deliberately does not, and where the line sits. It applies equally to a
board scaffolded by [the quickstart](../getting-started/quickstart.md)
and to `boards/stock` inside the Meith repository itself, which is shaped
like one on purpose.

## The board repository

Four files decide what a board is made of:

- **`package.json`** pins the engine. `@meith/web`, `@meith/cli` and the
  default theme are exact versions, not ranges — the board, its plugins
  and its compose file carry one version number, and
  [an upgrade](./operations/upgrading.md) moves them together. Nothing
  updates underneath you.

- **`meith.config.ts`** is the build-time registry. It calls
  `defineForumConfig` with the themes the board ships, which one is the
  default, and the installed plugins. Everything installable is named
  here statically so the bundler can see it and the compiler can check
  it: a production build contains exactly what this file names, and
  nothing discovered by scanning a directory at runtime.

- **`board.plugins.json`** is the plugin manifest — the list `meith
  plugin:add`/`plugin:remove` edit, and that you can edit by hand. Adding a
  plugin is `npm install <package>`, `meith plugin:add <package>`, and a
  redeploy.

- **`meith.plugins.ts`** turns that manifest into typed imports for the
  config to consume, and is generated from it: `meith plugin:add` writes it in
  a board (the CLI needs no build tooling to do so), and `pnpm board:gen`
  writes it in the Meith repository, where CI checks the two stay in step.

Registering a theme is the same motion: install its package, add an
entry to the `themes` map in `meith.config.ts`, set `defaultTheme`
if it should be the default, redeploy. The contracts those packages
implement are documented in [Themes](../customization/themes.md) and
[Plugins](../customization/plugins.md), and
[the marketplace](../customization/marketplace.md) is the curated feed
of ones worth installing.

Because all of that is a repository, it behaves like one: a plugin
arrives as a reviewable diff, a theme change is a commit you can revert,
and the whole board can be rebuilt from clone plus database backup.

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
- **Members and content** — threads, posts, messages, attachments.

The split is deliberate, and it is the reason both sides can be trusted
with their half: a deploy can never delete a forum or a member, and an
organiser clicking through the admin panel can never break the build or
downgrade a dependency.

## Runtime configuration

What connects a build to its environment — `DATABASE_URL`, the base URL,
mail credentials, upload paths — is environment variables, set where you
deploy rather than committed.
[Operations § Configuration](./operations/operating.md#configuration)
lists every variable a board reads and what happens when each is absent;
with none of them set, the board falls back to
[fixture mode](../contributing/development.md#fixture-mode) so a build
never needs production secrets.
