import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { NavigationItemRow, PluginNavigationRow } from '@meith/db'

vi.mock('@meith/core', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return { ...actual, env: { DATA_SOURCE: 'postgres' } }
})

const cacheStore = new Map<string, unknown>()
const keyTags = new Map<string, readonly string[]>()

vi.mock('@meith/drivers', () => ({
  drivers: () => ({
    cache: {
      async get(key: string) {
        return cacheStore.has(key) ? cacheStore.get(key) : undefined
      },
      async set(key: string, value: unknown, options?: { tags?: readonly string[] }) {
        cacheStore.set(key, value)
        keyTags.set(key, options?.tags ?? [])
      },
      async invalidateTags(tags: readonly string[]) {
        for (const [key, tagList] of keyTags) {
          if (tagList.some((tag) => tags.includes(tag))) {
            cacheStore.delete(key)
            keyTags.delete(key)
          }
        }
      },
    },
  }),
}))

const store: NavigationItemRow[] = []
let syncCalls = 0

vi.mock('@meith/db', () => {
  class PostgresNavigationRepository {
    async list(): Promise<readonly NavigationItemRow[]> {
      return store
    }
    async syncPluginItems(declared: readonly PluginNavigationRow[]) {
      syncCalls += 1
      const wanted = new Set(declared.map((item) => item.key))
      for (let index = store.length - 1; index >= 0; index -= 1) {
        const key = store[index]?.key
        if (key?.startsWith('plugin.') === true && !wanted.has(key)) store.splice(index, 1)
      }
      const added: string[] = []
      for (const item of declared) {
        if (store.some((row) => row.key === item.key)) continue
        store.push({
          id: store.length + 1,
          key: item.key,
          parentId: null,
          label: '',
          href: item.href,
          displayOrder: store.length,
          audience: item.audience,
          newTab: false,
          enabled: true,
          visibleToGroups: [],
        })
        added.push(item.key)
      }
      return { added, removed: [] }
    }
  }
  return { PostgresNavigationRepository, getDb: () => ({}) }
})

let pluginActive = true

vi.mock('./plugin-host', () => ({
  activeDefinitions: () =>
    pluginActive
      ? [{ key: 'dues', navigation: [{ key: 'plans', label: 'Membership', audience: 'members' }] }]
      : [],
  syncPluginEnablement: async () => {},
  pluginHost: { isEnabled: () => true },
}))

vi.mock('./container', () => ({
  getContainer: () => ({ authorizer: { inAnyGroup: () => true } }),
}))

vi.mock('./i18n', () => ({ getTranslator: async () => (key: string) => key }))

vi.mock('./search', () => ({ searchEnabled: async () => false }))

vi.mock('../view/navigation', () => ({
  buildNavigation: (shown: readonly NavigationItemRow[]) =>
    shown.map((item) => ({ href: item.href, label: item.label })),
  defaultNavigationItems: () => [],
}))

const { boardNavigation } = await import('./navigation')

const actor = {} as never
const viewer = {} as never

beforeEach(() => {
  cacheStore.clear()
  keyTags.clear()
  store.length = 0
  syncCalls = 0
  pluginActive = true
})

describe('boardNavigation reconciling plugin items', () => {
  it('writes a declared plugin item that the table is missing, without an admin visit', async () => {
    const links = await boardNavigation(actor, viewer)

    expect(syncCalls).toBe(1)
    const written = store.find((row) => row.key === 'plugin.dues.plans')
    expect(written).toBeDefined()
    expect(links.some((link) => link.href === written?.href)).toBe(true)
  })

  it('leaves the table alone once every declared item is already present', async () => {
    await boardNavigation(actor, viewer)
    syncCalls = 0

    await boardNavigation(actor, viewer)

    expect(syncCalls).toBe(0)
  })

  it('does not reconcile when no plugin declares an item and none is stored', async () => {
    pluginActive = false

    await boardNavigation(actor, viewer)

    expect(syncCalls).toBe(0)
  })
})
