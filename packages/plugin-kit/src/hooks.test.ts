import { describe, expect, it } from 'vitest'

import { HOOKS, HOOK_NAMES, hookKind, isHookName } from './hooks'
import { PLUGIN_REGIONS, REGION_NAMES, isPluginRegion } from './regions'

describe('the hook registry', () => {
  it('names every hook exactly once', () => {
    expect(new Set(HOOK_NAMES).size).toBe(HOOK_NAMES.length)
    expect(HOOK_NAMES.length).toBe(Object.keys(HOOKS).length)
  })

  /*
   * The acceptance criterion says 60+, and the number is not arbitrary: it is
   * the difference between "a few escape hatches" and enough coverage that a
   * plugin can be written without asking for a core change. Pinned so a deletion
   * has to argue with a test.
   */
  it('offers at least sixty hooks', () => {
    expect(HOOK_NAMES.length).toBeGreaterThanOrEqual(60)
  })

  it('gives every hook a kind, a feature and a purpose', () => {
    for (const name of HOOK_NAMES) {
      const spec = HOOKS[name]
      expect(['filter', 'event']).toContain(spec.kind)
      expect(spec.feature).toMatch(/^F\d\d$/)
      expect(spec.purpose.length).toBeGreaterThan(20)
    }
  })

  /*
   * Naming is a public API. A hook called `postCreated` beside one called
   * `post.created` is two conventions a plugin author has to remember, and the
   * one they guess is the one that silently never fires.
   */
  it('names every hook in dotted lower-case', () => {
    for (const name of HOOK_NAMES) {
      expect(name).toMatch(/^[a-z][a-z0-9-]*(\.[a-z0-9-]+)+$/)
    }
  })

  /*
   * The `view.*` hooks mirror theme-kit's slots, one for one, and the mapping is
   * mechanical: `PostBit` → `view.post-bit`. That is worth checking rather than
   * remembering, because the failure is silent in both directions — a slot with
   * no hook is a region no plugin can reach, and a hook naming a slot that was
   * renamed is a hook that fires with a payload nothing produces.
   *
   * The two provisional slots are excluded for the same reason theme-kit
   * excludes them from its freeze: nothing renders them, so there is nothing to
   * filter.
   */
  it('mirrors every stable theme slot with a view hook', async () => {
    const { SLOT_NAMES, SLOT_STABILITY } = await import('@meith/theme-kit')

    const kebab = (slot: string): string =>
      `view.${slot.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}`

    const expected = SLOT_NAMES.filter((slot) => SLOT_STABILITY[slot] !== 'provisional').map(kebab)
    const viewHooks = HOOK_NAMES.filter((name) => name.startsWith('view.'))

    expect([...viewHooks].sort()).toEqual([...expected].sort())
  })

  /*
   * The safety rule, pinned by name. Anything that only wants to *know*
   * something happened must be an event: an event's return value is discarded,
   * so a wrong one cannot corrupt what it was watching. Turning one of these
   * into a filter would hand a logging plugin the power to change a post.
   */
  it('keeps the observation hooks as events', () => {
    for (const name of ['post.created', 'user.logged-in', 'report.created', 'mail.sent'] as const) {
      expect(hookKind(name)).toBe('event')
    }
  })

  /*
   * And the converse: a hook whose whole purpose is to change a value has to be
   * a filter, or a plugin can register against it and silently do nothing.
   */
  it('keeps the transforming hooks as filters', () => {
    for (const name of ['markdown.render.html', 'view.post-bit', 'mail.send.before'] as const) {
      expect(hookKind(name)).toBe('filter')
    }
  })

  /*
   * R4, stated as a test. `authorization.can()` is the single answer to "may
   * this actor do this", and a hook able to filter it — or to reach inside F47's
   * visibility filter — is a plugin able to grant itself anything or to publish
   * a private forum. This asserts the absence rather than trusting the review
   * that removed it.
   */
  it('offers no hook over authorization or content visibility', () => {
    for (const name of HOOK_NAMES) {
      expect(name).not.toMatch(/permission|authoriz|visibility|\bcan\b/)
    }
  })

  it('recognises a real hook name and rejects a typo', () => {
    expect(isHookName('post.created')).toBe(true)
    expect(isHookName('post.create')).toBe(false)
    expect(isHookName('__proto__')).toBe(false)
  })
})

describe('the UI regions', () => {
  it('names every region once, with a purpose and a stated context', () => {
    expect(new Set(REGION_NAMES).size).toBe(REGION_NAMES.length)
    for (const name of REGION_NAMES) {
      expect(PLUGIN_REGIONS[name].purpose.length).toBeGreaterThan(20)
      expect(PLUGIN_REGIONS[name].context.length).toBeGreaterThan(5)
    }
  })

  /*
   * Deliberate friction, the same as the slot registry's client-slot count.
   * Every region is a commitment every theme has to render or silently drop, so
   * adding one should mean editing this list and arguing for it.
   */
  it('has exactly six regions', () => {
    expect(REGION_NAMES).toHaveLength(6)
  })

  it('rejects a name that is not a region', () => {
    expect(isPluginRegion('postbit.footer')).toBe(true)
    expect(isPluginRegion('PostBit')).toBe(false)
  })
})
