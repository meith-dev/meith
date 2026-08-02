/**
 * F66's read side.
 *
 * One claim, and it is the reason the editor is built from the registry rather
 * than from a list of fields written out in a component: **every permission in
 * `PERMISSION_FIELDS` gets a cell**. A screen that named its own fields would
 * silently stop showing whichever permission the next feature adds, and an
 * operator would conclude the board does not have it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PERMISSION_FIELDS, emptyPermissionSet } from '@forum/core'

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

vi.mock('@forum/db', () => ({
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

    expect(view?.cells.map((cell) => cell.key)).toEqual(
      PERMISSION_FIELDS.map((field) => field.key),
    )
  })

  it('carries the value the group actually holds', async () => {
    const view = await buildGroupPermissionView(2)
    expect(view?.cells.find((cell) => cell.key === 'canView')?.value).toBe(true)
  })

  it('includes the forum-scoped fields, because they are the group’s default', async () => {
    /*
     * They are R4.1 layer 1 — the answer for every forum that does not override
     * them. Leaving them off would hide the value most forums resolve to, and
     * an operator would set `canPostThreads` nowhere and wonder why nobody can
     * post. Kills the mutant that filters to `scope === 'global'`.
     */
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
