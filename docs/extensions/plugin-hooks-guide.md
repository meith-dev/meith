# Plugin hooks and lifecycle

Register hooks in `definePlugin`. The [generated hook reference](../reference/plugin-hooks.md) lists names, payloads and call sites.

## Hook execution

| Kind | Contract |
|---|---|
| Filter | Return the next value; do not mutate input. Each handler receives the previous result. |
| Event | Perform a side effect; return values are ignored. |

Handlers run by ascending priority (default `100`), then plugin key. Runtime access is lazy and cached per handler invocation. Fixture mode rejects services that need a database.

A throwing filter or one returning `undefined` retains the preceding value. Event exceptions are logged. Both count toward plugin failure health. Execution time is recorded; this is not a JavaScript timeout.

## Failures

`plugin_health` persists failures across processes. Five failures disable a plugin. An administrator must clear its failure state and enable it again; there is no timed reset.

Region error handling catches failures during `render`, including awaited work. It cannot catch a React component that throws later when React renders the returned tree. Perform fallible work in the region's `render` function.

Scheduled-task failures use the scheduler's failure handling; they are not ordinary hook failures.

## Lifecycle

| Handler | When it runs | Failure behaviour |
|---|---|---|
| `onInstall` | After migrations, before the installed version is recorded | Stops installation; make retries safe |
| `onEnable` | After an administrator enables the plugin | Logged and counted |
| `onDisable` | After an administrator disables the plugin | Logged and counted |
| `onUninstall` | Before purge deletes plugin data | Stops purge |

Automatic failure-based disabling does not invoke `onDisable`. Installation may be retried after partial progress, so `onInstall` must be idempotent.

Disabling retains data. Purge removes the plugin's namespaced tables and settings, migration records, navigation, version and health records. Lifecycle cleanup requires the plugin definition to remain available. Back up before purging.

## Versioning

Declare the supported plugin API version. Additions use minor versions; removing or renaming a public contract requires a major version. Check compatibility before distributing a package. Package release versions and plugin API versions are separate.
