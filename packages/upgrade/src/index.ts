/**
 * `@meith/upgrade` — what an upgrade does, and the order it does it in (F84).
 *
 * The plan is computed and returned rather than performed: `community upgrade
 * --dry-run` prints it, the admin notice counts it, and the runner executes it.
 * One description of what will happen, instead of a command whose behaviour can
 * only be discovered by letting it loose on a production database — and an
 * ordering that is testable without one, which is the part most likely to be
 * wrong.
 */

export {
  SUPPORTED_MAJOR_SPAN,
  checkUpgradeSpan,
  compareVersions,
  orderPlugins,
  parseVersion,
  planUpgrade,
  upgradeNotice,
  type OrderFailure,
  type PluginUpgrade,
  type UpgradePlan,
  type UpgradeRefusal,
  type UpgradeState,
  type UpgradeStep,
  type Version,
} from './plan'
