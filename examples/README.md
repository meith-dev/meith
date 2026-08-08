# Examples

Worked, installed, copyable starting points for the two ways a board is
extended. Both are registered on this repository's own board — the honest
install story is short enough to read in `forum.config.ts` and
`forum.plugins.ts` — so every CI run drives them through the rendering
contract, the contrast gate and the plugin host.

| Directory | Package | What it shows |
|---|---|---|
| [`hello-plugin`](./hello-plugin) | `@meith/example-plugin-hello` | The smallest plugin that does something visible with each extension point: a `view.footer` filter, an `index.footer` region contribution, a setting, a migration, a task and an admin page. |
| [`iris-theme`](./iris-theme) | `@meith/example-theme-iris` | The most common theme there is: the default board recoloured (one brand group of tokens, violet) plus a single slot override (`Footer`) where the markup genuinely disagrees. |

The policy documents are the place to start before copying either:
[docs/plugin-api.md](../docs/plugin-api.md) and
[docs/theme-api.md](../docs/theme-api.md). The generated references —
[docs/plugin-hooks.md](../docs/plugin-hooks.md) and
[docs/theme-slots.md](../docs/theme-slots.md) — list every hook and slot.

## Installing your copy

Both kinds of extension install the same way, because nothing is discovered by
scanning a directory at runtime (invariant 6 — a serverless bundle contains
only what the bundler saw):

1. Put the package in the workspace (copy a directory here, or `pnpm add` a
   published one).
2. Name it in the registry: themes in `apps/forum/forum.config.ts`, plugins in
   `apps/forum/forum.plugins.ts`.
3. Redeploy. If the plugin ships migrations, run `forum upgrade`.

A registered theme is immediately offered to members on the appearance screen
and to administrators under **Admin → Themes**. A registered plugin appears
under **Admin → Plugins**, where it can be switched off durably without a
redeploy.

## How the examples relate to their siblings

- `themes/default` is the reference implementation of every slot;
  `themes/midnight` is the maximal theme (twenty-two slots overridden, its own
  palette written out by hand). `iris` is deliberately the *minimal* one.
- `plugins/reference` exercises every wired hook and records what it was
  called with — it is a test double for the host, installed in CI and not on
  boards. `hello` is the one to copy.
