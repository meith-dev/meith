# Examples

Worked, copyable starting points for the two ways a board is extended. They are
**reference code, not installed**: this repository's board registers neither,
so a fresh checkout runs exactly what a fresh board would. Each carries its own
tests (`pnpm test` runs them), so the examples stay honest without being part
of the product.

| Directory | Package | What it shows |
|---|---|---|
| [`hello-plugin`](./hello-plugin) | `@meith/example-plugin-hello` | The smallest plugin that does something visible with each extension point: a `view.footer` filter, an `index.footer` region contribution, a setting, a migration, a task and an admin page. |
| [`iris-theme`](./iris-theme) | `@meith/example-theme-iris` | The most common theme there is: the default board recoloured (one brand group of tokens, violet) plus a single slot override (`Footer`) where the markup genuinely disagrees. |

They are also the source of `create-meith`'s extension scaffolds:
`npx create-meith --plugin <name>` and `--theme <name>` emit these two,
renamed, as standalone workspaces. The scaffold templates are generated from
this directory by `pnpm extension:gen`, and `pnpm verify` fails when they
drift, so editing an example is editing the scaffold.

The policy documents are the place to start before copying either:
[docs/customization/plugins.md](../docs/customization/plugins.md) and
[docs/customization/themes.md](../docs/customization/themes.md). The generated references —
[docs/reference/plugin-hooks.md](../docs/reference/plugin-hooks.md) and
[docs/reference/theme-slots.md](../docs/reference/theme-slots.md) — list every hook and slot.

## Installing one

Both kinds of extension install the same way, because nothing is discovered by
scanning a directory at runtime (invariant 6 — a serverless bundle contains
only what the bundler saw):

1. Put the package in the workspace (these two already are; a copy of one, or a
   `pnpm add`-ed package, joins the same way).
2. Name it in the registry: themes in `apps/community/meith.config.ts`, plugins in
   `apps/community/meith.plugins.ts`. For these two that is
   `{ key: 'hello', plugin: helloPlugin }` in the plugins list, and an `iris`
   entry beside `midnight` in the themes map — each file's comments show the
   shape.
3. Add the package to `apps/community/package.json` and `pnpm install`, then
   redeploy. If the plugin ships migrations, run `meith upgrade`.

A registered theme is immediately offered to members on the appearance screen
and to administrators under **Admin → Themes** — and is enrolled in the
rendering-contract and WCAG contrast suites, which read the theme map. A
registered plugin appears under **Admin → Plugins**, where it can be switched
off durably without a redeploy.

## How the examples relate to their siblings

- `themes/default` is the reference implementation of every slot;
  `themes/midnight` and `themes/raidframe` are the maximal ones (twenty-two and
  twenty-seven slots overridden, each with its own palette written out by hand).
  `themes/clubhouse` sits between them — twenty-two of its own, the writing,
  signing-in and control-panel slots inherited unchanged. `iris` is deliberately
  the *minimal* one.
- `plugins/reference` exercises every wired hook and records what it was
  called with — it is a test double for the host, installed in CI and not on
  boards. `hello` is the one to copy.
