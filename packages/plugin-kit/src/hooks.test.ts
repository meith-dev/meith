import { describe, expect, it } from 'vitest'

import { HOOK_NAMES, HOOKS, hookKind, isHookName } from './hooks'
import { isPluginRegion, PLUGIN_REGIONS, REGION_NAMES } from './regions'

describe('the hook registry', () => {
  it('names every hook exactly once', () => {
    expect(new Set(HOOK_NAMES).size).toBe(HOOK_NAMES.length)
    expect(HOOK_NAMES.length).toBe(Object.keys(HOOKS).length)
  })

  it('offers at least sixty hooks', () => {
    expect(HOOK_NAMES.length).toBeGreaterThanOrEqual(60)
  })

  it('gives every hook a kind and a purpose', () => {
    for (const name of HOOK_NAMES) {
      const spec = HOOKS[name]
      expect(['filter', 'event']).toContain(spec.kind)
      expect(spec.purpose.length).toBeGreaterThan(20)
    }
  })

  it('names every hook in dotted lower-case', () => {
    for (const name of HOOK_NAMES) {
      expect(name).toMatch(/^[a-z][a-z0-9-]*(\.[a-z0-9-]+)+$/)
    }
  })

  it('mirrors every stable theme slot with a view hook', async () => {
    const { SLOT_NAMES, SLOT_STABILITY } = await import('@meith/theme-kit')

    const kebab = (slot: string): string =>
      `view.${slot.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}`

    const expected = SLOT_NAMES.filter((slot) => SLOT_STABILITY[slot] !== 'provisional').map(kebab)
    const viewHooks = HOOK_NAMES.filter((name) => name.startsWith('view.'))

    expect([...viewHooks].sort()).toEqual([...expected].sort())
  })

  it('keeps the observation hooks as events', () => {
    for (const name of ['post.created', 'user.logged-in', 'report.created', 'mail.sent'] as const) {
      expect(hookKind(name)).toBe('event')
    }
  })

  it('keeps the transforming hooks as filters', () => {
    for (const name of ['markdown.render.html', 'view.post-bit', 'mail.send.before'] as const) {
      expect(hookKind(name)).toBe('filter')
    }
  })

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

  it('has exactly six regions', () => {
    expect(REGION_NAMES).toHaveLength(6)
  })

  it('rejects a name that is not a region', () => {
    expect(isPluginRegion('postbit.footer')).toBe(true)
    expect(isPluginRegion('PostBit')).toBe(false)
  })
})
