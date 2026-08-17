import { beforeEach, describe, expect, it, vi } from 'vitest'

import { emptyPermissionSet, PERMISSION_FIELDS } from '@meith/core'

const dataSource = { current: 'postgres' as 'postgres' | 'fixture' }
vi.mock('./container', () => ({
  getContainer: () => ({ dataSource: dataSource.current }),
}))

const groups = {
  current: [
    {
      id: 2,
      key: 'registered',
      title: 'Registered',
      description: null,
      displayOrder: 10,
      isSystem: true,
      isStaffGroup: false,
      badgeToken: null,
      memberCount: 3,
    },
  ],
}
const permissions = { current: { ...emptyPermissionSet(), canView: true } }

vi.mock('@meith/db', () => ({
  getDb: () => ({}),
  PostgresGroupAdminRepository: class {
    async list() {
      return groups.current
    }
    async readPermissions() {
      return permissions.current
    }
  },
  PostgresPromotionRepository: class {},
}))

const { buildGroupPermissionView, groupAdminRepository } = await import('./group-admin')

beforeEach(() => {
  dataSource.current = 'postgres'
})

describe('buildGroupPermissionView', () => {
  it('gives every registry field a cell, in registry order', async () => {
    const view = await buildGroupPermissionView(2)

    expect(view?.cells.map((cell) => cell.key)).toEqual(PERMISSION_FIELDS.map((field) => field.key))
  })

  it('carries the value the group actually holds', async () => {
    const view = await buildGroupPermissionView(2)
    expect(view?.cells.find((cell) => cell.key === 'canView')?.value).toBe(true)
  })

  it('includes the forum-scoped fields, because they are the group’s default', async () => {
    const view = await buildGroupPermissionView(2)
    expect(view?.cells.some((cell) => cell.scope === 'forum')).toBe(true)
  })

  it('is null for a group that does not exist', async () => {
    expect(await buildGroupPermissionView(9_999)).toBeNull()
  })

  it('is null — not a broken screen — on a board with no database', async () => {
    dataSource.current = 'fixture'
    expect(await buildGroupPermissionView(2)).toBeNull()
    expect(groupAdminRepository()).toBeNull()
  })
})
