/**
 * F79 — the host: the only thing that ever calls a plugin.
 *
 * Three properties, and each is a decision the rest of the codebase depends on.
 *
 * ## 1. A plugin cannot crash a request
 *
 * Every handler runs inside a try/catch. A filter that throws leaves the value
 * as it was and the chain continues with the next plugin; an event that throws
 * is recorded and forgotten. Nothing a plugin does propagates to the page.
 *
 * The line that is *not* crossed: this makes plugin failures survivable, not
 * invisible. Every failure is counted, logged with the plugin key and the hook,
 * and shown in `health()`. A board whose plugin has been failing on every render
 * for a week should be able to find that out in one screen.
 *
 * ## 2. Deterministic order
 *
 * Handlers are sorted by **(priority, plugin key)** — both total, both declared,
 * neither derived from module evaluation order or from how `forum.config.ts`
 * happens to list its plugins. Two plugins filtering the same value therefore
 * compose the same way on the dev server, in a serverless bundle and in the
 * worker.
 *
 * The sort is computed **once, at construction**, not per call: a hot hook like
 * `view.post-bit` runs once per post, and sorting a list on every post to get the
 * same answer is the kind of cost that only shows up on a real board.
 *
 * ## 3. Auto-disable, with an honest account of what it can do
 *
 * A plugin that has failed `failureThreshold` times is switched off for the rest
 * of this process: its handlers stop being called and `health()` says why. It
 * does not re-enable itself — a plugin that recovers on its own hides the fault,
 * and the operator never learns their board spent a day without the feature they
 * installed.
 *
 * **The counter is per instance and lives in memory.** On a serverless platform
 * that means it resets whenever the platform decides to, so auto-disable
 * protects a *request path within one instance* rather than switching the plugin
 * off across the board. That is a real limit and it is the honest one: durable
 * disabling is a write, a write needs the database, and a host that opened a
 * connection from inside a render to decide whether to call a hook would be a
 * worse problem than the one it solved. Making it durable is an operator action
 * in the ACP, which is where F69 puts it.
 *
 * ## Timing is measured, never enforced
 *
 * Each call is timed and the slow ones are surfaced. There is deliberately no
 * timeout, because JavaScript has no way to abort a handler: a `Promise.race`
 * that "times out" returns control while the handler keeps running, keeps its
 * database connection, and still resolves later. That is not a timeout, it is a
 * lie that also leaks. Measuring and reporting is what can honestly be done.
 */

import { HOOKS, type HookName } from './hooks'
import type { HookContext, HookValue } from './payloads'
import type { HookRegistration, PluginContribution, PluginDefinition } from './plugin'
import type { PluginRegion, PluginRegionContext } from './regions'

export interface HostLogger {
  readonly warn: (message: string, detail: Record<string, unknown>) => void
  readonly error: (message: string, detail: Record<string, unknown>) => void
}

export interface PluginHostOptions {
  /** Plugins the config registered as enabled. Disabled ones are never passed in. */
  readonly plugins: readonly PluginDefinition[]
  readonly logger?: HostLogger | undefined
  /** Failures before a plugin is switched off for this process. Default 5. */
  readonly failureThreshold?: number | undefined
  /** A single call taking longer than this is logged once and recorded. Default 50ms. */
  readonly slowCallMs?: number | undefined
  /** Injectable for tests; `performance.now` in production. */
  readonly now?: (() => number) | undefined
}

export interface PluginHealth {
  readonly key: string
  readonly enabled: boolean
  readonly disabledReason: string | null
  readonly calls: number
  readonly failures: number
  readonly slowCalls: number
  /** Total time spent inside this plugin's handlers, in this process. */
  readonly totalMs: number
  /** The most recent failure, for the ACP row. */
  readonly lastError: { readonly hook: string; readonly message: string } | null
}

/**
 * A handler as the host stores it.
 *
 * The map is heterogeneous — eighty-odd hooks with eighty-odd payload types in
 * one structure — so the specific `K` cannot survive storage. It is erased here,
 * once, at the boundary, rather than by a cast at each of the four call sites.
 * The types that matter are still enforced where they can be: `definePlugin`
 * checks the manifest against `PluginHooks`, and `applyFilter`/`emit` are generic
 * in `K`, so a caller passing the wrong payload for a hook is a compile error.
 */
type StoredHandler = (value: unknown, context: unknown) => unknown

interface Entry {
  readonly pluginKey: string
  readonly priority: number
  readonly handler: StoredHandler
}

interface Stats {
  enabled: boolean
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

    /*
     * Sorted once. `localeCompare` is deliberately not used: it is
     * locale-dependent, and "deterministic" has to mean across machines too.
     */
    const byPriorityThenKey = <T extends { priority: number; pluginKey: string }>(a: T, b: T): number =>
      a.priority - b.priority || (a.pluginKey < b.pluginKey ? -1 : a.pluginKey > b.pluginKey ? 1 : 0)

    for (const list of this.#entries.values()) list.sort(byPriorityThenKey)
    for (const list of this.#contributions.values()) list.sort(byPriorityThenKey)
  }

  /**
   * Run a filter chain and return the final value.
   *
   * Each plugin receives what the previous one returned. A handler that throws,
   * or that returns `undefined` where the value type is not nullable, is skipped
   * and the previous value is kept — a filter is allowed to decline, and
   * `undefined` is what a handler that forgot to return looks like.
   */
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

  /**
   * Tell every listener that something happened.
   *
   * Return values are discarded — that is the definition of an event, and it is
   * why an integration that only wants to observe should be one: it cannot
   * corrupt what it is watching even if it is wrong.
   *
   * Handlers run in sequence rather than in parallel. Order is part of the
   * contract, and `Promise.all` would also let a slow plugin's work overlap with
   * the next one's, making the per-plugin timings meaningless.
   */
  async emit<K extends HookName>(name: K, value: HookValue<K>, context: HookContext<K>): Promise<void> {
    const entries = this.#entries.get(name)
    if (entries === undefined) return

    for (const entry of entries) {
      if (!this.#isEnabled(entry.pluginKey)) continue
      await this.#call(entry.pluginKey, name, () => entry.handler(value, context))
    }
  }

  /**
   * Collect the markup plugins contribute to a region.
   *
   * Isolation here is **partial, and the boundary is worth knowing.** Calling
   * the contribution is wrapped, so a plugin that throws while building its node
   * is dropped and the region renders without it. A node that throws later,
   * during React's own render, cannot be contained from here: catching that
   * needs an error boundary, error boundaries are client components, and putting
   * one around every plugin contribution would ship JavaScript to every page to
   * guard against a bug.
   *
   * So the rule for a contribution is: build your markup in the function, do not
   * return a component that does work. That is stated in the plugin docs and
   * enforced by nothing, which is the honest position.
   */
  renderRegion(region: PluginRegion, context: PluginRegionContext): readonly { key: string; node: unknown }[] {
    const entries = this.#contributions.get(region)
    if (entries === undefined) return []

    const nodes: { key: string; node: unknown }[] = []
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

  /** Every plugin's counters, for the ACP and for a health endpoint. */
  health(): readonly PluginHealth[] {
    return [...this.#stats.entries()]
      .map(([key, stats]) => ({
        key,
        enabled: stats.enabled,
        disabledReason: stats.disabledReason,
        calls: stats.calls,
        failures: stats.failures,
        slowCalls: stats.slowCalls,
        totalMs: Math.round(stats.totalMs * 100) / 100,
        lastError: stats.lastError === null ? null : { ...stats.lastError },
      }))
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  }

  /**
   * Switch a plugin off for the rest of this process.
   *
   * Exposed so an operator action and the failure counter reach the same state
   * through one path — two ways of disabling a plugin is two things to get wrong.
   */
  disable(pluginKey: string, reason: string): void {
    const stats = this.#stats.get(pluginKey)
    if (stats === undefined || !stats.enabled) return
    stats.enabled = false
    stats.disabledReason = reason
    this.#logger.error('plugin disabled', { plugin: pluginKey, reason })
  }

  /** Which hooks anything is listening on. Used by the ACP's hook-health view. */
  listeners(): Readonly<Record<string, readonly string[]>> {
    const out: Record<string, string[]> = {}
    for (const [hook, entries] of this.#entries) {
      out[hook] = entries.map((entry) => entry.pluginKey)
    }
    return out
  }

  #isEnabled(pluginKey: string): boolean {
    return this.#stats.get(pluginKey)?.enabled === true
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
      /*
       * The elapsed time is recorded for a failure too. A plugin that throws
       * after four seconds is a performance problem as well as a broken one, and
       * only counting successes would hide exactly that case.
       */
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

/** Every hook the registry knows, with nothing listening. For an empty board. */
export function emptyHost(): PluginHost {
  return new PluginHost({ plugins: [] })
}

/** The kind of a hook, re-exported so a host consumer need not import the registry. */
export function isFilter(name: HookName): boolean {
  return HOOKS[name].kind === 'filter'
}
