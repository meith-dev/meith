# Plugins

Define a plugin with `definePlugin` from `@meith/plugin-kit`. Start with the [plugin tutorial](first-plugin.md); the generated package includes tests and example services.

| Capability | Guide |
|---|---|
| Modify models or react to events | [Hooks and lifecycle](plugin-hooks-guide.md) |
| Add HTTP endpoints and panel pages | [Routes and pages](plugin-pages.md) |
| Read settings, notify members or schedule work | [Services](plugin-services.md) |
| Store data or grant membership | [Storage](plugin-storage.md) |
| Add regions, navigation or Markdown | [Presentation](plugin-presentation.md) |
| Look up hook payloads | [Generated reference](../reference/plugin-hooks.md) |

Keep keys, settings and tables in the plugin's namespace. Use runtime services for board data and permission checks. Plugins execute inside the board process; install trusted code only.

A plugin cannot replace a theme slot. Use a region or filter for additions and a [theme](themes.md) for structural changes.
