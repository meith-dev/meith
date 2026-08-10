import type { ReactNode } from 'react'

import { HOOKS, type HookName } from './hooks'
import type { HookContext, HookValue } from './payloads'
import type { HookRegistration, PluginContribution, PluginDefinition } from './plugin'
import type { PluginRegion, PluginRegionContext } from './regions'

export interface HostLogger {
  readonly warn: (message: string, detail: Record<string, unknown>) => void
  readonly error: (message: string, detail: Record<string, unknown>) => void
}

export interface PluginHostOptions {
  readonly plugins: readonly PluginDefinition[]
  readonly logger?: HostLogger | undefined
  readonly failureThreshold?: number | undefined
  readonly slowCallMs?: number | undefined
  readonly now?: (() => number) | undefined
}

export interface PluginHealth {
  readonly key: string
  readonly enabled: boolean
  readonly operatorDisabled: boolean
  readonly disabledReason: string | null
  readonly calls: number
  readonly failures: number
  readonly slowCalls: number
  readonly totalMs: number
  readonly lastError: { readonly hook: string; readonly message: string } | null
}

type StoredHandler = (value: unknown, context: unknown) => unknown

interface Entry {
  readonly pluginKey: string
  readonly priority: number
  readonly handler: StoredHandler
}

interface Stats {
  enabled: boolean
  operatorDisabled: boolean
  disabledReason: string | null
  calls: number
  failures: number
  slowCalls: number
  totalMs: number
  lastError: { hook: string; message: string } | null
}

const DEFAULT_PRIORITY = 100

export class PluginHost {
  readonly #entries = new Map<HookName, Entry[]>()
  readonly #contributions = new Map<PluginRegion, { pluginKey: string; priority: number; contribution: PluginContribution }[]>()
  readonly #stats = new Map<string, Stats>()
  readonly #logger: HostLogger
  readonly #failureThreshold: number
  readonly #slowCallMs: number
  readonly #now: () => number

  constructor(options: PluginHostOptions) {
    this.#logger = options.logger ?? { warn: () => {}, error: () => {} }
    this.#failureThreshold = options.failureThreshold ?? 5
    this.#slowCallMs = options.slowCallMs ?? 50
    this.#now = options.now ?? (() => performance.now())

    for (const plugin of options.plugins) {
      this.#stats.set(plugin.key, {
        enabled: true,
        operatorDisabled: false,
        disabledReason: null,
        calls: 0,
        failures: 0,
        slowCalls: 0,
        totalMs: 0,
        lastError: null,
      })

      for (const [name, registration] of Object.entries(plugin.hooks ?? {})) {
        const hook = name as HookName
        const handler = (
          typeof registration === 'function' ? registration : (registration as HookRegistration<HookName>).handler
        ) as StoredHandler
        const priority =
          typeof registration === 'function'
            ? DEFAULT_PRIORITY
            : (registration.priority ?? DEFAULT_PRIORITY)

        const list = this.#entries.get(hook) ?? []
        list.push({ pluginKey: plugin.key, priority, handler })
        this.#entries.set(hook, list)
      }

      for (const contribution of plugin.contributions ?? []) {
        const list = this.#contributions.get(contribution.region) ?? []
        list.push({
          pluginKey: plugin.key,
          priority: contribution.priority ?? DEFAULT_PRIORITY,
          contribution,
        })
        this.#contributions.set(contribution.region, list)
      }
    }

    const byPriorityThenKey = <T extends { priority: number; pluginKey: string }>(a: T, b: T): number =>
      a.priority - b.priority || (a.pluginKey < b.pluginKey ? -1 : a.pluginKey > b.pluginKey ? 1 : 0)

    for (const list of this.#entries.values()) list.sort(byPriorityThenKey)
    for (const list of this.#contributions.values()) list.sort(byPriorityThenKey)
  }

  async applyFilter<K extends HookName>(
    name: K,
    value: HookValue<K>,
    context: HookContext<K>,
  ): Promise<HookValue<K>> {
    const entries = this.#entries.get(name)
    if (entries === undefined || entries.length === 0) return value

    let current = value
    for (const entry of entries) {
      if (!this.#isEnabled(entry.pluginKey)) continue

      const result = await this.#call(entry.pluginKey, name, () => entry.handler(current, context))

      if (result.ok && result.value !== undefined) current = result.value as HookValue<K>
    }
    return current
  }

  async emit<K extends HookName>(name: K, value: HookValue<K>, context: HookContext<K>): Promise<void> {
    const entries = this.#entries.get(name)
    if (entries === undefined) return

    for (const entry of entries) {
      if (!this.#isEnabled(entry.pluginKey)) continue
      await this.#call(entry.pluginKey, name, () => entry.handler(value, context))
    }
  }

  renderRegion(
    region: PluginRegion,
    context: PluginRegionContext,
  ): readonly { key: string; node: ReactNode }[] {
    const entries = this.#contributions.get(region)
    if (entries === undefined) return []

    const nodes: { key: string; node: ReactNode }[] = []
    for (const entry of entries) {
      if (!this.#isEnabled(entry.pluginKey)) continue

      const started = this.#now()
      try {
        const node = entry.contribution.render(context)
        this.#record(entry.pluginKey, region, this.#now() - started)
        if (node !== null && node !== undefined) nodes.push({ key: entry.pluginKey, node })
      } catch (error) {
        this.#fail(entry.pluginKey, region, error)
      }
    }
    return nodes
  }

  health(): readonly PluginHealth[] {
    return [...this.#stats.entries()]
      .map(([key, stats]) => ({
        key,
        enabled: stats.enabled && !stats.operatorDisabled,
        operatorDisabled: stats.operatorDisabled,
        disabledReason: stats.disabledReason,
        calls: stats.calls,
        failures: stats.failures,
        slowCalls: stats.slowCalls,
        totalMs: Math.round(stats.totalMs * 100) / 100,
        lastError: stats.lastError === null ? null : { ...stats.lastError },
      }))
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  }

  disable(pluginKey: string, reason: string): void {
    const stats = this.#stats.get(pluginKey)
    if (stats === undefined || !stats.enabled) return
    stats.enabled = false
    stats.disabledReason = reason
    this.#logger.error('plugin disabled', { plugin: pluginKey, reason })
  }

  setOperatorDisabled(keys: readonly string[]): void {
    const disabled = new Set(keys)
    for (const [key, stats] of this.#stats) {
      stats.operatorDisabled = disabled.has(key)
    }
  }

  /**
   * Whether the plugin is currently allowed to run here: registered, not
   * switched off by the operator, and not auto-disabled by its own failures.
   */
  isEnabled(pluginKey: string): boolean {
    return this.#isEnabled(pluginKey)
  }

  /**
   * Runs plugin code from a surface that is not a hook — a route handler, a
   * page render — under the same accounting: timed, counted, failures logged
   * against the plugin, auto-disable applied. `disabled` is the caller's cue
   * to answer 404 rather than 500: an off plugin has no surfaces.
   */
  async run<T>(
    pluginKey: string,
    surface: string,
    invoke: () => Promise<T> | T,
  ): Promise<{ status: 'ok'; value: T } | { status: 'failed' } | { status: 'disabled' }> {
    if (!this.#isEnabled(pluginKey)) return { status: 'disabled' }

    const outcome = await this.#call(pluginKey, surface, invoke)
    return outcome.ok ? { status: 'ok', value: outcome.value as T } : { status: 'failed' }
  }

  listeners(): Readonly<Record<string, readonly string[]>> {
    const out: Record<string, string[]> = {}
    for (const [hook, entries] of this.#entries) {
      out[hook] = entries.map((entry) => entry.pluginKey)
    }
    return out
  }

  #isEnabled(pluginKey: string): boolean {
    const stats = this.#stats.get(pluginKey)
    return stats !== undefined && stats.enabled && !stats.operatorDisabled
  }

  async #call(
    pluginKey: string,
    hook: string,
    invoke: () => unknown,
  ): Promise<{ ok: true; value: unknown } | { ok: false }> {
    const started = this.#now()
    try {
      const value = await invoke()
      this.#record(pluginKey, hook, this.#now() - started)
      return { ok: true, value }
    } catch (error) {
      this.#record(pluginKey, hook, this.#now() - started)
      this.#fail(pluginKey, hook, error)
      return { ok: false }
    }
  }

  #record(pluginKey: string, hook: string, elapsedMs: number): void {
    const stats = this.#stats.get(pluginKey)
    if (stats === undefined) return

    stats.calls += 1
    stats.totalMs += elapsedMs
    if (elapsedMs >= this.#slowCallMs) {
      stats.slowCalls += 1
      this.#logger.warn('slow plugin hook', {
        plugin: pluginKey,
        hook,
        ms: Math.round(elapsedMs),
      })
    }
  }

  #fail(pluginKey: string, hook: string, error: unknown): void {
    const stats = this.#stats.get(pluginKey)
    if (stats === undefined) return

    stats.failures += 1
    const message = error instanceof Error ? error.message : String(error)
    stats.lastError = { hook, message }

    this.#logger.error('plugin hook failed', { plugin: pluginKey, hook, message })

    if (stats.failures >= this.#failureThreshold) {
      this.disable(
        pluginKey,
        `${stats.failures} failures in this process, most recently in "${hook}"`,
      )
    }
  }
}

export function emptyHost(): PluginHost {
  return new PluginHost({ plugins: [] })
}

export function isFilter(name: HookName): boolean {
  return HOOKS[name].kind === 'filter'
}
