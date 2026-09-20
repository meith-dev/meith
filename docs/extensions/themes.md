# Themes

Define a theme with `defineTheme` from `@meith/theme-kit`. Inherit an existing theme and override only the required slots and tokens.

| Task | Guide |
|---|---|
| Create and install a theme | [First theme](first-theme.md) |
| Implement slots and models | [Theme contract](theme-contract.md) |
| Set colours and use shared controls | [Tokens and controls](theme-design.md) |
| Check layouts and states | [Theme testing](theme-testing.md) |
| Look up slot props | [Generated reference](../reference/theme-slots.md) |

Themes render prepared models and regions. They do not read the database, authorize requests or implement mutations. Use a [plugin](plugins.md) for new behaviour.
