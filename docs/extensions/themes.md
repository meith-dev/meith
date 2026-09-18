# Theme development

A theme supplies presentation through `@meith/theme-kit`. It receives view models from the host and renders named slots. Start with [Build your first theme](first-theme.md) for the scaffold-and-test workflow.

## Start with inheritance

Extend the default theme and override only the slots you need. A palette change belongs in tokens; a markup change belongs in a slot. This leaves the rest of the board, including its member and staff panels, covered by the parent theme.

The worked example is `examples/iris-theme`. The shipped themes provide larger examples, but copying a whole theme is unnecessary for a small customization.

## Find the relevant contract

| Task | Reference |
|---|---|
| Understand slots, view models and version compatibility | [Theme contracts](theme-contract.md) |
| Choose tokens, fonts, colors and shared controls | [Tokens and shared controls](theme-design.md) |
| Exercise populated, empty and restricted states | [Test a theme](theme-testing.md) |
| Look up every slot and model field | [Generated slot reference](../reference/theme-slots.md) |
| Translate or override messages | [Translations](internationalisation.md) |

## Keep data and presentation separate

A theme must not read the database, cookies, request or session. The board resolves data and permissions before building the model. Models contain serializable values, not executable access to the application.

Declare slot maps statically so tooling can verify server/client boundaries. Preserve native forms and links where possible, and test the JavaScript-disabled experience. Use tokens for colors so administrators can restyle the board.

## Make the theme available

Install the theme package in the board, register it in `meith.config.ts`, then rebuild and deploy. The [installation guide](../operations/installing.md) covers an existing theme; [marketplace publishing](marketplace.md) covers distribution.
