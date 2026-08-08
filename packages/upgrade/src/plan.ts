/**
 * F84 — what an upgrade is, and the order it happens in.
 *
 * ## An upgrade is not "run the migrations"
 *
 * That is one of four things, and it is the one people remember. The other three
 * are what make upgrades go wrong:
 *
 *  - **plugins have migrations too**, and theirs run after core's, because a
 *    plugin's table almost always references one of core's;
 *  - **plugins depend on each other**, so "after core" is not an order — it is a
 *    partial order, and applying them in configuration order works until the day
 *    somebody lists them differently;
 *  - **the board has to know it is out of date**, or an operator who deploys new
 *    code and forgets the command has a board running new application logic
 *    against an old schema, which fails in whichever request happens to touch
 *    the missing column.
 *
 * ## Why a plan, rather than just doing it
 *
 * The plan is computed first and returned. `community upgrade --dry-run` prints it,
 * the ACP notice counts it, and the runner executes it — one description of what
 * will happen, rather than a command whose behaviour can only be discovered by
 * letting it loose on a production database.
 *
 * That also makes the ordering testable without a database, which is the part
 * most likely to be wrong.
 */

/** A semantic version, parsed. Build metadata and pre-release tags are refused. */
export interface Version {
  readonly major: number
  readonly minor: number
  readonly patch: number
}

export function parseVersion(value: string): Version {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value.trim())
  if (match === null) {
    throw new Error(`upgrade: "${value}" is not a version. Expected major.minor.patch.`)
  }
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) }
}

/** `Array#sort` convention. */
export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a)
  const right = parseVersion(b)
  return left.major - right.major || left.minor - right.minor || left.patch - right.patch
}

/**
 * The documented support window: an upgrade may cross **two majors**.
 *
 * Not unlimited, and the honesty is the point. Supporting an arbitrary jump means
 * every migration must remain correct against every schema that ever existed,
 * which is a promise nobody can test and therefore nobody should make. Two majors
 * is what the migration set is exercised against, so it is what is claimed.
 *
 * A board further behind is not stuck — it upgrades in stages, which is a
 * documented procedure rather than an error message.
 */
export const SUPPORTED_MAJOR_SPAN = 2

export type UpgradeRefusal =
  | { readonly kind: 'downgrade'; readonly from: string; readonly to: string }
  | { readonly kind: 'too-far'; readonly from: string; readonly to: string; readonly span: number }

/**
 * May a board at `from` upgrade directly to `to`?
 *
 * Downgrades are refused outright rather than attempted. Migrations are
 * forward-only (invariant 32), so "downgrading" means running new code against a
 * schema that has already been migrated past it — which usually appears to work
 * and corrupts something a week later.
 */
export function checkUpgradeSpan(from: string, to: string): UpgradeRefusal | null {
  const order = compareVersions(from, to)
  if (order > 0) return { kind: 'downgrade', from, to }
  if (order === 0) return null

  const span = parseVersion(to).major - parseVersion(from).major
  if (span > SUPPORTED_MAJOR_SPAN) return { kind: 'too-far', from, to, span }
  return null
}

/* ------------------------------------------------------------------ *
 * Dependency order
 * ------------------------------------------------------------------ */

export interface PluginUpgrade {
  readonly key: string
  readonly version: string
  /** Keys of plugins that must be upgraded first. */
  readonly dependsOn: readonly string[]
  /** Migration ids the plugin declares, in ascending order. */
  readonly migrationIds: readonly string[]
}

export type OrderFailure =
  | { readonly kind: 'cycle'; readonly keys: readonly string[] }
  | { readonly kind: 'missing'; readonly key: string; readonly dependency: string }

/**
 * Topologically sort plugins, or explain why they cannot be.
 *
 * **Ties break on the key**, which is the difference between a correct order and
 * a *deterministic* one. A partial order has many valid linearisations; picking
 * the same one every time means an upgrade rehearsed on a staging board runs the
 * migrations in the same sequence on production, which is the only way rehearsing
 * is worth anything.
 *
 * A cycle is reported with the keys still involved rather than as "a cycle
 * exists": with twenty plugins installed, knowing *which* three are tangled is
 * the whole diagnostic.
 */
export function orderPlugins(
  plugins: readonly PluginUpgrade[],
): { readonly ok: true; readonly order: readonly PluginUpgrade[] } | { readonly ok: false; readonly failure: OrderFailure } {
  const byKey = new Map(plugins.map((plugin) => [plugin.key, plugin]))

  for (const plugin of plugins) {
    for (const dependency of plugin.dependsOn) {
      if (!byKey.has(dependency)) {
        return { ok: false, failure: { kind: 'missing', key: plugin.key, dependency } }
      }
    }
  }

  const remaining = new Map(byKey)
  const order: PluginUpgrade[] = []

  while (remaining.size > 0) {
    const ready = [...remaining.values()]
      .filter((plugin) => plugin.dependsOn.every((key) => !remaining.has(key)))
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))

    if (ready.length === 0) {
      return { ok: false, failure: { kind: 'cycle', keys: [...remaining.keys()].sort() } }
    }

    /*
     * One at a time rather than the whole ready set. Taking the batch would be
     * faster and would make the order depend on how the batches happened to
     * fall — re-deriving `ready` after each removal keeps the sequence a pure
     * function of the graph.
     */
    const next = ready[0]!
    remaining.delete(next.key)
    order.push(next)
  }

  return { ok: true, order }
}

/* ------------------------------------------------------------------ *
 * The plan
 * ------------------------------------------------------------------ */

export interface UpgradeStep {
  readonly kind: 'core-migrations' | 'plugin-migrations' | 'record-version'
  readonly label: string
  /** The plugin this step belongs to, or `null` for core. */
  readonly pluginKey: string | null
  /** Migration ids this step will apply. Empty when nothing is pending. */
  readonly migrationIds: readonly string[]
}

export interface UpgradeState {
  /** The version recorded in the database. */
  readonly recordedVersion: string
  /** The version of the code that is running. */
  readonly codeVersion: string
  readonly pendingCoreMigrations: readonly string[]
  readonly plugins: readonly PluginUpgrade[]
  /** Already-applied migration ids, keyed by plugin. */
  readonly appliedPluginMigrations: Readonly<Record<string, readonly string[]>>
}

export interface UpgradePlan {
  readonly steps: readonly UpgradeStep[]
  readonly refusal: UpgradeRefusal | null
  readonly orderFailure: OrderFailure | null
  /** Is there anything to do at all? */
  readonly pending: boolean
}

/**
 * Work out what upgrading this board would do.
 *
 * Core first, then plugins in dependency order, then the version record — and
 * the last one is last for the same reason the installer's seal is: a version
 * written before the work means a failed upgrade leaves a board claiming to be
 * something it is not, and the next run does nothing.
 */
export function planUpgrade(state: UpgradeState): UpgradePlan {
  const refusal = checkUpgradeSpan(state.recordedVersion, state.codeVersion)
  if (refusal !== null) {
    return { steps: [], refusal, orderFailure: null, pending: false }
  }

  const ordered = orderPlugins(state.plugins)
  if (!ordered.ok) {
    return { steps: [], refusal: null, orderFailure: ordered.failure, pending: false }
  }

  const steps: UpgradeStep[] = []

  if (state.pendingCoreMigrations.length > 0) {
    steps.push({
      kind: 'core-migrations',
      label: `Apply ${state.pendingCoreMigrations.length} core migration(s)`,
      pluginKey: null,
      migrationIds: state.pendingCoreMigrations,
    })
  }

  for (const plugin of ordered.order) {
    const applied = new Set(state.appliedPluginMigrations[plugin.key] ?? [])
    const pending = plugin.migrationIds.filter((id) => !applied.has(id))
    if (pending.length === 0) continue

    steps.push({
      kind: 'plugin-migrations',
      label: `Apply ${pending.length} migration(s) for ${plugin.key}`,
      pluginKey: plugin.key,
      migrationIds: pending,
    })
  }

  /*
   * The version is recorded even when no migration was pending — a release can
   * change behaviour without changing the schema, and a board whose recorded
   * version never moves would show the "upgrade pending" notice forever.
   */
  const versionChanged = compareVersions(state.recordedVersion, state.codeVersion) !== 0
  if (steps.length > 0 || versionChanged) {
    steps.push({
      kind: 'record-version',
      label: `Record version ${state.codeVersion}`,
      pluginKey: null,
      migrationIds: [],
    })
  }

  return { steps, refusal: null, orderFailure: null, pending: steps.length > 0 }
}

/**
 * The one-line answer the ACP notice needs.
 *
 * `null` when there is nothing to say. An admin panel that permanently displays
 * "everything is fine" is one people stop reading, and the notice's whole value
 * is being unusual.
 */
export function upgradeNotice(plan: UpgradePlan, state: UpgradeState): string | null {
  if (plan.refusal?.kind === 'downgrade') {
    return (
      `This board's database is at ${plan.refusal.from} and the running code is ` +
      `${plan.refusal.to}. That is a downgrade: migrations are forward-only, so the code ` +
      'is older than the schema it is talking to. Deploy the newer version again.'
    )
  }
  if (plan.refusal?.kind === 'too-far') {
    return (
      `This board is at ${plan.refusal.from} and the running code is ${plan.refusal.to} — ` +
      `${plan.refusal.span} majors apart, and upgrades are supported across ` +
      `${SUPPORTED_MAJOR_SPAN}. Upgrade in stages; see docs/upgrading.md.`
    )
  }
  if (plan.orderFailure?.kind === 'cycle') {
    return `These plugins depend on each other in a cycle: ${plan.orderFailure.keys.join(', ')}.`
  }
  if (plan.orderFailure?.kind === 'missing') {
    return (
      `Plugin "${plan.orderFailure.key}" needs "${plan.orderFailure.dependency}", which is not ` +
      'installed.'
    )
  }
  if (!plan.pending) return null

  const migrations = plan.steps
    .filter((step) => step.kind !== 'record-version')
    .reduce((total, step) => total + step.migrationIds.length, 0)

  return (
    `An upgrade is pending: the database is at ${state.recordedVersion} and this deployment ` +
    `is ${state.codeVersion}` +
    (migrations > 0 ? `, with ${migrations} migration(s) to apply` : '') +
    '. Run `community upgrade`.'
  )
}
