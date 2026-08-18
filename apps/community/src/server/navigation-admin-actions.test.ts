import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { NavigationDropTarget, NavigationItemInput, NavigationItemRow } from '@meith/db'

const revalidated: string[] = []
vi.mock('next/cache', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    revalidatePath: (path: string) => {
      revalidated.push(path)
    },
  }
})

const adminCalls: Array<{ action: string; detail: unknown }> = []
vi.mock('./admin', () => ({
  requireAdmin: async () => ({ session: { userId: 1 } }),
  recordAdminAction: async (input: { action: string; detail?: unknown }) => {
    adminCalls.push({ action: input.action, detail: input.detail })
  },
}))

const invalidated: string[][] = []
vi.mock('@meith/drivers', () => ({
  drivers: () => ({
    cache: {
      async invalidateTags(tags: string[]) {
        invalidated.push(tags)
      },
    },
  }),
}))

const created: NavigationItemInput[] = []
const updated: Array<{ id: number; input: NavigationItemInput }> = []
const deleted: number[] = []
const arranged: Array<{ id: number; target: NavigationDropTarget }> = []
const listed: NavigationItemRow[] = []
let repositoryPresent = true

vi.mock('./navigation', () => ({
  navigationRepository: () =>
    repositoryPresent
      ? {
          async list() {
            return listed
          },
          async create(input: NavigationItemInput) {
            created.push(input)
            return 12
          },
          async arrange(id: number, target: NavigationDropTarget) {
            arranged.push({ id, target })
          },
          async update(id: number, input: NavigationItemInput) {
            updated.push({ id, input })
          },
          async delete(id: number) {
            deleted.push(id)
          },
        }
      : null,
}))

const {
  arrangeNavigationItemAction,
  createNavigationItemAction,
  deleteNavigationItemAction,
  updateNavigationItemAction,
} = await import('./navigation-admin-actions')

function row(over: Partial<NavigationItemRow> = {}): NavigationItemRow {
  return {
    id: 1,
    key: null,
    parentId: null,
    label: 'One',
    href: '/one',
    displayOrder: 0,
    audience: 'all',
    newTab: false,
    enabled: true,
    visibleToGroups: [],
    ...over,
  }
}

function form(fields: Record<string, string | string[]>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    for (const entry of Array.isArray(value) ? value : [value]) data.append(key, entry)
  }
  return data
}

const VALID = { label: 'Chat', href: 'https://chat.example.test', audience: 'all' }

beforeEach(() => {
  adminCalls.length = 0
  invalidated.length = 0
  revalidated.length = 0
  created.length = 0
  updated.length = 0
  deleted.length = 0
  arranged.length = 0
  listed.length = 0
  repositoryPresent = true
})

describe('adding a menu item', () => {
  it('stores it, clears the cached menu, and writes the admin log', async () => {
    const state = await createNavigationItemAction({}, form({ ...VALID, enabled: '1' }))

    expect(state.error).toBeUndefined()
    expect(created[0]?.label).toBe('Chat')
    expect(created[0]?.enabled).toBe(true)
    expect(invalidated[0]).toEqual(['navigation'])
    expect(revalidated).toContain('/admin/content/navigation')
    expect(adminCalls[0]?.action).toBe('content.navigation_item_added')
  })

  it('reads the ticked groups, ignoring anything that is not a group id', async () => {
    await createNavigationItemAction({}, form({ ...VALID, groups: ['2', '5', 'nonsense'] }))

    expect(created[0]?.visibleToGroups).toEqual([2, 5])
  })

  it('treats an unticked box as off', async () => {
    await createNavigationItemAction({}, form(VALID))

    expect(created[0]?.enabled).toBe(false)
    expect(created[0]?.newTab).toBe(false)
  })

  it('accepts a path on this board', async () => {
    const state = await createNavigationItemAction({}, form({ ...VALID, href: '/rules' }))

    expect(state.error).toBeUndefined()
    expect(created[0]?.href).toBe('/rules')
  })

  it('refuses an address that is neither a local path nor a web address', async () => {
    const state = await createNavigationItemAction(
      {},
      form({ ...VALID, href: 'javascript:alert(1)' }),
    )

    expect(state.error).toBeDefined()
    expect(created).toHaveLength(0)
  })

  it('refuses a protocol-relative address, which leaves the board', async () => {
    const state = await createNavigationItemAction({}, form({ ...VALID, href: '//evil.example' }))

    expect(state.error).toBeDefined()
    expect(created).toHaveLength(0)
  })

  it('refuses an audience the database would not accept', async () => {
    const state = await createNavigationItemAction({}, form({ ...VALID, audience: 'moderators' }))

    expect(state.error).toBeDefined()
    expect(created).toHaveLength(0)
  })

  it('refuses a parent id that is not one', async () => {
    const state = await createNavigationItemAction({}, form({ ...VALID, parentId: '-3' }))

    expect(state.error).toBeDefined()
    expect(created).toHaveLength(0)
  })

  it('says so plainly when the board has no database behind it', async () => {
    repositoryPresent = false

    const state = await createNavigationItemAction({}, form(VALID))

    expect(state.error).toBeDefined()
  })
})

describe('editing and removing a menu item', () => {
  it('passes the row id and the chosen parent through on an update', async () => {
    await updateNavigationItemAction({}, form({ ...VALID, id: '4', parentId: '7' }))

    expect(updated[0]?.id).toBe(4)
    expect(updated[0]?.input.parentId).toBe(7)
    expect(adminCalls[0]?.action).toBe('content.navigation_item_changed')
  })

  it('removes a row and clears the cached menu', async () => {
    const state = await deleteNavigationItemAction({}, form({ id: '4' }))

    expect(state.notice).toBe('deleted')
    expect(deleted).toEqual([4])
    expect(invalidated[0]).toEqual(['navigation'])
    expect(adminCalls[0]?.action).toBe('content.navigation_item_removed')
  })

  it('refuses a row id that is not one', async () => {
    const state = await deleteNavigationItemAction({}, form({ id: '0' }))

    expect(state.error).toBeDefined()
    expect(deleted).toHaveLength(0)
  })
})

describe('arranging the menu', () => {
  beforeEach(() => {
    listed.push(
      row({ id: 1, label: 'One', displayOrder: 0 }),
      row({ id: 2, label: 'Two', displayOrder: 10 }),
      row({ id: 3, label: 'Three', displayOrder: 20 }),
    )
  })

  it('takes a dropped position straight from the form', async () => {
    const state = await arrangeNavigationItemAction({}, form({ id: '3', afterId: '1' }))

    expect(state.notice).toBe('moved')
    expect(arranged[0]).toEqual({ id: 3, target: { parentId: null, afterId: 1 } })
    expect(invalidated[0]).toEqual(['navigation'])
    expect(adminCalls[0]?.action).toBe('content.navigation_item_moved')
  })

  it('works out where a nudge lands, for a reader with no JavaScript', async () => {
    await arrangeNavigationItemAction({}, form({ id: '3', nudge: 'up' }))

    expect(arranged[0]).toEqual({ id: 3, target: { parentId: null, afterId: 1 } })
  })

  it('nests an item under the one above it', async () => {
    await arrangeNavigationItemAction({}, form({ id: '2', nudge: 'in' }))

    expect(arranged[0]).toEqual({ id: 2, target: { parentId: 1, afterId: null } })
  })

  it('says so rather than moving when the item is already there', async () => {
    const state = await arrangeNavigationItemAction({}, form({ id: '2', afterId: '1' }))

    expect(state.notice).toBe('unmoved')
    expect(arranged).toHaveLength(0)
  })

  it('refuses a nudge that has nowhere to go', async () => {
    const state = await arrangeNavigationItemAction({}, form({ id: '1', nudge: 'up' }))

    expect(state.error).toBeDefined()
    expect(arranged).toHaveLength(0)
  })

  it('refuses a direction that is not one', async () => {
    const state = await arrangeNavigationItemAction({}, form({ id: '1', nudge: 'sideways' }))

    expect(state.error).toBeDefined()
  })

  it('refuses to arrange an item the board does not have', async () => {
    const state = await arrangeNavigationItemAction({}, form({ id: '99', afterId: '1' }))

    expect(state.error).toBeDefined()
    expect(arranged).toHaveLength(0)
  })
})
