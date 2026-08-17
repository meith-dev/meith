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

export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a)
  const right = parseVersion(b)
  return left.major - right.major || left.minor - right.minor || left.patch - right.patch
}

export const SUPPORTED_MAJOR_SPAN = 2

export type UpgradeRefusal =
  | { readonly kind: 'downgrade'; readonly from: string; readonly to: string }
  | { readonly kind: 'too-far'; readonly from: string; readonly to: string; readonly span: number }

export function checkUpgradeSpan(from: string, to: string): UpgradeRefusal | null {
  const order = compareVersions(from, to)
  if (order > 0) return { kind: 'downgrade', from, to }
  if (order === 0) return null

  const span = parseVersion(to).major - parseVersion(from).major
  if (span > SUPPORTED_MAJOR_SPAN) return { kind: 'too-far', from, to, span }
  return null
}

export interface PluginUpgrade {
  readonly key: string
  readonly version: string
  readonly dependsOn: readonly string[]
  readonly migrationIds: readonly string[]
}

export type OrderFailure =
  | { readonly kind: 'cycle'; readonly keys: readonly string[] }
  | { readonly kind: 'missing'; readonly key: string; readonly dependency: string }

export function orderPlugins(
  plugins: readonly PluginUpgrade[],
):
  | { readonly ok: true; readonly order: readonly PluginUpgrade[] }
  | { readonly ok: false; readonly failure: OrderFailure } {
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

    const next = ready[0]!
    remaining.delete(next.key)
    order.push(next)
  }

  return { ok: true, order }
}

export interface UpgradeStep {
  readonly kind: 'core-migrations' | 'plugin-migrations' | 'record-version'
  readonly label: string
  readonly pluginKey: string | null
  readonly migrationIds: readonly string[]
}

export interface UpgradeState {
  readonly recordedVersion: string
  readonly codeVersion: string
  readonly pendingCoreMigrations: readonly string[]
  readonly plugins: readonly PluginUpgrade[]
  readonly appliedPluginMigrations: Readonly<Record<string, readonly string[]>>
}

export interface UpgradePlan {
  readonly steps: readonly UpgradeStep[]
  readonly refusal: UpgradeRefusal | null
  readonly orderFailure: OrderFailure | null
  readonly pending: boolean
}

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

  if (compareVersions(state.recordedVersion, state.codeVersion) === 0) {
    const plugins = plan.steps
      .filter((step) => step.kind === 'plugin-migrations')
      .map((step) => step.pluginKey)
      .filter((key): key is string => key !== null)

    return (
      `The database and this deployment are both at ${state.recordedVersion}, but ` +
      `${migrations} migration(s) have never been applied` +
      (plugins.length > 0 ? ` (${plugins.join(', ')})` : '') +
      '. Run `community upgrade`.'
    )
  }

  return (
    `An upgrade is pending: the database is at ${state.recordedVersion} and this deployment ` +
    `is ${state.codeVersion}` +
    (migrations > 0 ? `, with ${migrations} migration(s) to apply` : '') +
    '. Run `community upgrade`.'
  )
}
