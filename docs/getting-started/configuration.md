# Configuration in code

A Meith board is a small repository. This page is what lives in it,
what deliberately does not, and where the line sits. It applies equally
to a board scaffolded by [the quickstart](../setting-up/quickstart.md)
and to `boards/stock` inside the Meith repository, which is shaped like
one on purpose.

## The board repository

Four files decide what a board is made of:

- **`package.json`** pins the engine. `@meith/web`, `@meith/cli`, the
  default theme and `next` are exact versions, not ranges. The board,
  its plugins and its compose file carry one version number, and
  [an upgrade](../operating/upgrading.md) moves them together.
- **`meith.config.ts`** is the build-time registry. It calls
  `defineForumConfig` with the themes the board ships, which one is the
  default, and the installed plugins. A production build contains
  exactly what this file names; nothing is discovered by scanning a
  directory at runtime.
- **`board.plugins.json`** is the plugin manifest: the list that
  `meith plugin:add` and `plugin:remove` edit, and that you can edit by
  hand.
- **`meith.plugins.ts`** turns that manifest into typed imports and is
  generated from it. `meith plugin:add` writes it in a board, and
  `pnpm board:gen` writes it in the Meith repository, where CI checks
  the two stay in step.

Adding a plugin is `meith plugin:add <package>` and a redeploy.
Registering a theme is the same motion: install its package, add an
entry to the `themes` map in `meith.config.ts`, set `defaultTheme` if it
should be the default, redeploy.
[Installing plugins and themes](./installing.md) has the commands;
[Themes](../developing/themes.md) and [Plugins](../developing/plugins.md)
have the contracts those packages implement.

Because all of that is a repository, a plugin arrives as a reviewable
diff, a theme change is a commit you can revert, and the whole board can
be rebuilt from a clone plus a database backup.

## What stays out of the repository

Everything the community *does* lives in PostgreSQL and is run from the
browser, by people who never see this repository:

- **The forum tree and who may do what**, arranged at `/admin/forums`
  with the per-forum permission matrix.
  [Forums and permissions](../using/forums.md) is the reference.
- **Groups, promotions and allowances**:
  [Groups and promotions](../using/groups.md).
- **Board settings**: the name, colours, registration policy, spam
  thresholds and the rest of `/admin/settings`, covered by
  [the organiser's guide](../using/organiser-guide.md) and
  [the spam controls reference](../using/antispam.md).
- **Members and content**: threads, posts, messages, attachments.

The split is why both sides can be trusted with their half: a deploy can
never delete a forum or a member, and an organiser clicking through the
admin panel can never break the build or downgrade a dependency.

## Runtime configuration

What connects a build to its environment, such as `DATABASE_URL`, the
base URL, mail credentials and upload paths, is environment variables,
set where you deploy rather than committed.
[Operations § Configuration](../operating/operating.md#configuration)
lists every variable a board reads and what happens when each is absent.
With none of them set, the board falls back to
[fixture mode](../developing/development.md#fixture-mode), so a build
never needs production secrets.
