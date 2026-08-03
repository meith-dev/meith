import { describe, expect, it } from 'vitest'

import {
  SUPPORTED_MAJOR_SPAN,
  checkUpgradeSpan,
  compareVersions,
  orderPlugins,
  parseVersion,
  planUpgrade,
  upgradeNotice,
  type PluginUpgrade,
  type UpgradeState,
} from './index'

function plugin(key: string, overrides: Partial<PluginUpgrade> = {}): PluginUpgrade {
  return { key, version: '1.0.0', dependsOn: [], migrationIds: [], ...overrides }
}

function state(overrides: Partial<UpgradeState> = {}): UpgradeState {
  return {
    recordedVersion: '1.0.0',
    codeVersion: '1.1.0',
    pendingCoreMigrations: [],
    plugins: [],
    appliedPluginMigrations: {},
    ...overrides,
  }
}

describe('versions', () => {
  it('parses major.minor.patch', () => {
    expect(parseVersion('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 })
    expect(parseVersion(' 10.0.99 ')).toEqual({ major: 10, minor: 0, patch: 99 })
  })

  /*
   * Strict, for the reason theme-kit's parser is: a lenient reader eventually
   * yields NaN, every comparison against NaN is false, and the checks that
   * refuse a downgrade or an over-long jump silently stop firing.
   */
  it.each(['1.2', '1.2.3.4', 'v1.2.3', '1.2.3-beta', '', 'next'])('refuses %o', (value) => {
    expect(() => parseVersion(value)).toThrow(/not a version/)
  })

  it('orders by major, then minor, then patch', () => {
    expect(compareVersions('1.0.0', '2.0.0')).toBeLessThan(0)
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0)
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0)
  })
})

describe('the supported span', () => {
  it('allows an upgrade within two majors', () => {
    expect(checkUpgradeSpan('1.0.0', '3.0.0')).toBeNull()
    expect(checkUpgradeSpan('1.0.0', '1.4.2')).toBeNull()
    expect(checkUpgradeSpan('2.1.0', '2.1.0')).toBeNull()
  })

  /*
   * Not unlimited, and the honesty is the point: supporting an arbitrary jump
   * means every migration must stay correct against every schema that ever
   * existed, which is a promise nobody can test.
   */
  it('refuses a jump further than the window', () => {
    expect(checkUpgradeSpan('1.0.0', '4.0.0')).toEqual({
      kind: 'too-far',
      from: '1.0.0',
      to: '4.0.0',
      span: 3,
    })
    expect(SUPPORTED_MAJOR_SPAN).toBe(2)
  })

  /*
   * Migrations are forward-only, so "downgrading" is new code against a schema
   * already migrated past it — which usually appears to work and corrupts
   * something a week later.
   */
  it('refuses a downgrade outright', () => {
    expect(checkUpgradeSpan('2.0.0', '1.9.9')).toEqual({
      kind: 'downgrade',
      from: '2.0.0',
      to: '1.9.9',
    })
  })
})

describe('dependency order', () => {
  it('puts a dependency before its dependent', () => {
    const result = orderPlugins([
      plugin('badges', { dependsOn: ['points'] }),
      plugin('points'),
    ])
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.order.map((p) => p.key)).toEqual(['points', 'badges'])
  })

  /*
   * **Deterministic, not merely correct.** A partial order has many valid
   * linearisations; picking the same one every time is what makes an upgrade
   * rehearsed on staging run the same sequence on production. The input here is
   * deliberately reverse-alphabetical so a sort that did nothing would fail.
   */
  it('breaks ties on the key, so the order is reproducible', () => {
    const result = orderPlugins([plugin('zulu'), plugin('mike'), plugin('alpha')])
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.order.map((p) => p.key)).toEqual(['alpha', 'mike', 'zulu'])
  })

  it('produces the same order however the input is arranged', () => {
    const set = [plugin('c', { dependsOn: ['a'] }), plugin('b'), plugin('a')]
    const first = orderPlugins(set)
    const second = orderPlugins([...set].reverse())

    expect(first.ok && second.ok).toBe(true)
    if (first.ok && second.ok) {
      expect(first.order.map((p) => p.key)).toEqual(second.order.map((p) => p.key))
    }
  })

  it('handles a chain of three', () => {
    const result = orderPlugins([
      plugin('c', { dependsOn: ['b'] }),
      plugin('a'),
      plugin('b', { dependsOn: ['a'] }),
    ])
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.order.map((p) => p.key)).toEqual(['a', 'b', 'c'])
  })

  /* Which plugins are tangled is the entire diagnostic with twenty installed. */
  it('names the plugins in a cycle', () => {
    const result = orderPlugins([
      plugin('a', { dependsOn: ['b'] }),
      plugin('b', { dependsOn: ['a'] }),
      plugin('untangled'),
    ])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.failure).toEqual({ kind: 'cycle', keys: ['a', 'b'] })
  })

  it('catches a plugin depending on itself', () => {
    const result = orderPlugins([plugin('a', { dependsOn: ['a'] })])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.failure.kind).toBe('cycle')
  })

  it('names a dependency that is not installed', () => {
    const result = orderPlugins([plugin('badges', { dependsOn: ['points'] })])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.failure).toEqual({ kind: 'missing', key: 'badges', dependency: 'points' })
    }
  })

  it('orders nothing without complaining', () => {
    const result = orderPlugins([])
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.order).toEqual([])
  })
})

describe('the plan', () => {
  it('is empty when the board is up to date', () => {
    const plan = planUpgrade(state({ recordedVersion: '1.1.0', codeVersion: '1.1.0' }))
    expect(plan.pending).toBe(false)
    expect(plan.steps).toEqual([])
  })

  it('applies core migrations before any plugin’s', () => {
    const plan = planUpgrade(
      state({
        pendingCoreMigrations: ['0024_thing'],
        plugins: [plugin('badges', { migrationIds: ['0001_init'] })],
      }),
    )
    expect(plan.steps.map((step) => step.kind)).toEqual([
      'core-migrations',
      'plugin-migrations',
      'record-version',
    ])
  })

  it('skips a plugin whose migrations are already applied', () => {
    const plan = planUpgrade(
      state({
        plugins: [plugin('badges', { migrationIds: ['0001_init'] })],
        appliedPluginMigrations: { badges: ['0001_init'] },
      }),
    )
    expect(plan.steps.filter((step) => step.kind === 'plugin-migrations')).toEqual([])
  })

  it('applies only the plugin migrations that are new', () => {
    const plan = planUpgrade(
      state({
        plugins: [plugin('badges', { migrationIds: ['0001_init', '0002_add'] })],
        appliedPluginMigrations: { badges: ['0001_init'] },
      }),
    )
    const step = plan.steps.find((entry) => entry.pluginKey === 'badges')
    expect(step?.migrationIds).toEqual(['0002_add'])
  })

  /*
   * Last, for the same reason the installer's seal is: a version written before
   * the work means a failed upgrade leaves a board claiming to be something it
   * is not, and the next run finds nothing to do.
   */
  it('records the version last', () => {
    const plan = planUpgrade(state({ pendingCoreMigrations: ['0024_thing'] }))
    expect(plan.steps.at(-1)?.kind).toBe('record-version')
  })

  /*
   * A release can change behaviour without changing the schema. A board whose
   * recorded version never moved would show the pending notice forever.
   */
  it('records the version even when no migration is pending', () => {
    const plan = planUpgrade(state({ recordedVersion: '1.0.0', codeVersion: '1.0.1' }))
    expect(plan.pending).toBe(true)
    expect(plan.steps).toHaveLength(1)
    expect(plan.steps[0]?.kind).toBe('record-version')
  })

  it('plans nothing and reports the refusal for a downgrade', () => {
    const plan = planUpgrade(state({ recordedVersion: '2.0.0', codeVersion: '1.0.0' }))
    expect(plan.steps).toEqual([])
    expect(plan.refusal?.kind).toBe('downgrade')
    expect(plan.pending).toBe(false)
  })

  it('plans nothing when the plugins cannot be ordered', () => {
    const plan = planUpgrade(
      state({
        plugins: [plugin('a', { dependsOn: ['b'] }), plugin('b', { dependsOn: ['a'] })],
      }),
    )
    expect(plan.steps).toEqual([])
    expect(plan.orderFailure?.kind).toBe('cycle')
  })

  it('orders plugin steps by dependency, not by configuration order', () => {
    const plan = planUpgrade(
      state({
        plugins: [
          plugin('badges', { dependsOn: ['points'], migrationIds: ['0001_a'] }),
          plugin('points', { migrationIds: ['0001_b'] }),
        ],
      }),
    )
    expect(plan.steps.filter((s) => s.pluginKey !== null).map((s) => s.pluginKey)).toEqual([
      'points',
      'badges',
    ])
  })
})

describe('the admin notice', () => {
  /*
   * `null` when there is nothing to say. A panel that permanently displays
   * "everything is fine" is one people stop reading, and this notice's value is
   * being unusual.
   */
  it('says nothing when the board is current', () => {
    const current = state({ recordedVersion: '1.1.0', codeVersion: '1.1.0' })
    expect(upgradeNotice(planUpgrade(current), current)).toBeNull()
  })

  it('names both versions and the migration count', () => {
    const pending = state({ pendingCoreMigrations: ['0024_a', '0025_b'] })
    const notice = upgradeNotice(planUpgrade(pending), pending)

    expect(notice).toContain('1.0.0')
    expect(notice).toContain('1.1.0')
    expect(notice).toContain('2 migration(s)')
    expect(notice).toContain('forum upgrade')
  })

  it('omits the migration count when there are none', () => {
    const pending = state({ recordedVersion: '1.0.0', codeVersion: '1.0.1' })
    expect(upgradeNotice(planUpgrade(pending), pending)).not.toContain('migration(s)')
  })

  it('explains a downgrade rather than reporting a pending upgrade', () => {
    const bad = state({ recordedVersion: '2.0.0', codeVersion: '1.0.0' })
    expect(upgradeNotice(planUpgrade(bad), bad)).toMatch(/downgrade/)
  })

  it('points a too-far board at the staged procedure', () => {
    const far = state({ recordedVersion: '1.0.0', codeVersion: '4.0.0' })
    const notice = upgradeNotice(planUpgrade(far), far)
    expect(notice).toContain('in stages')
    expect(notice).toContain('docs/upgrading.md')
  })

  it('names the tangled plugins', () => {
    const tangled = state({
      plugins: [plugin('a', { dependsOn: ['b'] }), plugin('b', { dependsOn: ['a'] })],
    })
    expect(upgradeNotice(planUpgrade(tangled), tangled)).toContain('a, b')
  })

  it('names a missing dependency', () => {
    const missing = state({ plugins: [plugin('badges', { dependsOn: ['points'] })] })
    const notice = upgradeNotice(planUpgrade(missing), missing)
    expect(notice).toContain('badges')
    expect(notice).toContain('points')
  })
})
