# Build extensions

Extend a board through a theme or plugin. You need Node.js, npm and a development board; changing Meith's core source is a separate [contribution workflow](../contributing/development.md).

## Choose an extension

| Goal | Extension | First tutorial |
|---|---|---|
| Change colors, layout or page presentation | Theme | [Build your first theme](first-theme.md) |
| Add behavior, settings, pages or scheduled work | Plugin | [Write your first plugin](first-plugin.md) |
| Add an existing package to your board | Installed theme or plugin | [Install extensions](../operations/installing.md) |

Start by inheriting an existing theme or using the plugin scaffold. Both scaffolds come from the repository's tested examples.

## Continue with the contracts

For themes, read [Theme development](themes.md), [tokens and controls](theme-design.md), and the [slot and view-model reference](../reference/theme-slots.md).

For plugins, read [Plugin development](plugins.md), [hooks and lifecycle](plugin-hooks-guide.md), and the [hook reference](../reference/plugin-hooks.md).

The host provides the extension APIs. A theme does not fetch community data, and a plugin does not import the board's database or domain internals. Keep within those boundaries so upgrades remain possible.

## Test and share

Run the scaffold's tests and typecheck, then check the extension inside a board. Verify keyboard access, member permissions and the supported JavaScript-disabled flow. Add translations using [Translations](internationalisation.md).

When the extension is ready for others, follow [Publish to the marketplace](marketplace.md). Publishing a package and installing it into a board are separate actions.
