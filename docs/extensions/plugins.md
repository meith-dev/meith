# Plugin development

A plugin registers behavior with `definePlugin` from `@meith/plugin-kit`. Start with [Write your first plugin](first-plugin.md) to create and run a working example.

## Choose the capability

| You want to… | Read |
|---|---|
| Transform a view model or react to an event | [Hooks and lifecycle](plugin-hooks-guide.md) |
| Put content in a page region or editor | [UI and content rendering](plugin-presentation.md) |
| Store data or grant an approved group | [Storage, groups and migrations](plugin-storage.md) |
| Handle requests or add board/staff/admin pages | [Routes and pages](plugin-pages.md) |
| Expose settings, send notifications or run tasks | [Settings and services](plugin-services.md) |
| Look up exact names and payloads | [Generated hook reference](../reference/plugin-hooks.md) |

## Respect the host boundary

Plugins use the host context and published interfaces. Do not import domain packages, database adapters or application internals. A plugin's tables stay in its own namespace; migrations must not alter core tables or create foreign keys to them.

Validate input received through routes and forms. Staff pages and member pages have different access requirements. A plugin must not infer that being installed grants it permission to reveal a member, group or piece of content.

Filters return a new value. Events react to a completed action; their return value is ignored. The host isolates failures, but you should still handle expected errors and make retryable work safe to repeat.

## Register and deploy

A plugin must be installed and statically registered in the board before a build. Follow [Install plugins and themes](../operations/installing.md). Commit the package and registry changes, build, deploy and apply its migrations before relying on stored plugin data.

Disabling a plugin, removing its code and purging its data are different operations. Back up first and follow the removal procedure when data must be deleted.

## Maintain compatibility

Version the plugin, retain applied migrations unchanged, and document configuration and permissions. Test the declared Meith compatibility range before [publishing a listing](marketplace.md).
