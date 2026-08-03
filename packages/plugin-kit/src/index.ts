/**
 * `@forum/plugin-kit` — the contract between the board and a plugin (F79).
 *
 * Four things:
 *
 *  - `HOOKS` — every point a plugin may observe or alter, each declaring whether
 *    it is a filter (its result is used) or an event (its result is discarded);
 *  - `HookSignatures` — the typed value and context each hook is handed;
 *  - `definePlugin` — what a plugin declares about itself, validated at load;
 *  - `PluginHost` — the only thing that calls a plugin, and the reason a plugin
 *    cannot crash a request.
 *
 * **Everything exported here is public API.** A module not re-exported from this
 * barrel is an internal.
 *
 * The reference generated from the registry is docs/plugin-hooks.md; the policy
 * — versioning, what a plugin may not do, and why — is docs/plugin-api.md.
 */

export {
  HOOKS,
  HOOK_NAMES,
  hookKind,
  isHookName,
  type HookKind,
  type HookName,
  type HookSpec,
} from './hooks'

export type {
  DraftPayload,
  ForumRef,
  HookContext,
  HookSignatures,
  HookValue,
  ModerationRef,
  PostRef,
  RequestRef,
  ThreadRef,
  UserRef,
  ValidationMessages,
  ViewerRef,
} from './payloads'

export {
  definePlugin,
  pluginAdminPath,
  pluginSettingKey,
  pluginTaskId,
  type EventHandler,
  type FilterHandler,
  type HookHandler,
  type HookRegistration,
  type PluginAdminPage,
  type PluginContribution,
  type PluginDefinition,
  type PluginHooks,
  type PluginMigration,
  type PluginRuntimeContext,
  type PluginSetting,
  type PluginTask,
} from './plugin'

export {
  PLUGIN_REGIONS,
  REGION_NAMES,
  isPluginRegion,
  type PluginRegion,
  type PluginRegionContext,
  type RegionSpec,
} from './regions'

export {
  PluginHost,
  emptyHost,
  isFilter,
  type HostLogger,
  type PluginHealth,
  type PluginHostOptions,
} from './host'
