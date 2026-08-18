import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { NavigationItemInput } from '@meith/db'

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
let repositoryPresent = true

vi.mock('./navigation', () => ({
  navigationRepository: () =>
    repositoryPresent
      ? {
          async create(input: NavigationItemInput) {
            created.push(input)
            return 12
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

const { createNavigationItemAction, deleteNavigationItemAction, updateNavigationItemAction } =
  await import('./navigation-admin-actions')

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

  it('refuses a display order that is not a whole number', async () => {
    const state = await createNavigationItemAction({}, form({ ...VALID, displayOrder: '-3' }))

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
  it('passes the row id through on an update', async () => {
    await updateNavigationItemAction({}, form({ ...VALID, id: '4', displayOrder: '20' }))

    expect(updated[0]?.id).toBe(4)
    expect(updated[0]?.input.displayOrder).toBe(20)
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
