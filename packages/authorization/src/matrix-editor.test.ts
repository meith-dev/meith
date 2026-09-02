import { describe, expect, it } from 'vitest'

import { emptyPermissionSet, type PermissionSet } from '@meith/core'

import {
  buildFieldMatrix,
  buildPermissionMatrix,
  diffMatrixSubmission,
  matrixCellName,
  matrixCellValue,
  planCopyToDescendants,
  readMatrixCell,
} from './matrix-editor'
import type { ForumOverride } from './types'

const ROOT = 10
const PARENT = 20
const CHILD = 30

const REGISTERED = 2
const STAFF = 3

function group(groupId: number, title: string, over: Partial<PermissionSet> = {}) {
  return { groupId, title, permissions: { ...emptyPermissionSet(), ...over } }
}

function cell(rows: ReturnType<typeof buildPermissionMatrix>, groupId: number, key: string) {
  const row = rows.find((r) => r.groupId === groupId)
  const found = row?.cells.find((c) => c.key === key)
  if (found === undefined) throw new Error(`no cell ${key} for group ${groupId}`)
  return found
}

const CHAIN = [CHILD, PARENT, ROOT]

describe('a cell with nothing set anywhere', () => {
  const rows = buildPermissionMatrix({
    chain: CHAIN,
    groups: [group(REGISTERED, 'Registered', { canPostThreads: true })],
    overrides: [],
  })

  it('is stored as inherit and resolves to the group default', () => {
    const found = cell(rows, REGISTERED, 'canPostThreads')
    expect(found.stored).toBeNull()
    expect(found.effective).toBe(true)
  })

  it('reports no ancestor, because there was none', () => {
    expect(cell(rows, REGISTERED, 'canPostThreads').inheritedFrom).toBeNull()
  })
})

describe('a cell inherited from an ancestor', () => {
  const overrides: ForumOverride[] = [
    { forumId: PARENT, groupId: REGISTERED, overrides: { canPostThreads: false } },
  ]
  const rows = buildPermissionMatrix({
    chain: CHAIN,
    groups: [group(REGISTERED, 'Registered', { canPostThreads: true })],
    overrides,
  })

  it('stays stored-as-inherit while resolving to the ancestor’s value', () => {
    const found = cell(rows, REGISTERED, 'canPostThreads')
    expect(found.stored).toBeNull()
    expect(found.effective).toBe(false)
  })

  it('names which forum supplied it', () => {
    expect(cell(rows, REGISTERED, 'canPostThreads').inheritedFrom).toBe(PARENT)
  })

  it('takes the nearest ancestor when several set it', () => {
    const rows2 = buildPermissionMatrix({
      chain: CHAIN,
      groups: [group(REGISTERED, 'Registered', { canPostThreads: true })],
      overrides: [
        ...overrides,
        { forumId: ROOT, groupId: REGISTERED, overrides: { canPostThreads: true } },
      ],
    })
    expect(cell(rows2, REGISTERED, 'canPostThreads').inheritedFrom).toBe(PARENT)
  })
})

describe('a cell set on this forum', () => {
  const rows = buildPermissionMatrix({
    chain: CHAIN,
    groups: [group(REGISTERED, 'Registered', { canPostThreads: true })],
    overrides: [
      { forumId: CHILD, groupId: REGISTERED, overrides: { canPostThreads: false } },
      { forumId: PARENT, groupId: REGISTERED, overrides: { canPostThreads: true } },
    ],
  })

  it('shows its own value and reports no inheritance', () => {
    const found = cell(rows, REGISTERED, 'canPostThreads')
    expect(found.stored).toBe(false)
    expect(found.effective).toBe(false)
    expect(found.inheritedFrom).toBeNull()
  })
})

describe('a row resolves for its own group only', () => {
  it('does not show one group the value another group would win', () => {
    const rows = buildPermissionMatrix({
      chain: CHAIN,
      groups: [
        group(REGISTERED, 'Registered', { canPostThreads: false }),
        group(STAFF, 'Staff', { canPostThreads: true }),
      ],
      overrides: [],
    })

    expect(cell(rows, REGISTERED, 'canPostThreads').effective).toBe(false)
    expect(cell(rows, STAFF, 'canPostThreads').effective).toBe(true)
  })
})

describe('numeric cells', () => {
  it('carry the resolved number and the same three states', () => {
    const rows = buildPermissionMatrix({
      chain: CHAIN,
      groups: [group(REGISTERED, 'Registered', { maxAttachmentsPerPost: 4 })],
      overrides: [
        { forumId: PARENT, groupId: REGISTERED, overrides: { maxAttachmentsPerPost: 2 } },
      ],
    })

    const found = cell(rows, REGISTERED, 'maxAttachmentsPerPost')
    expect(found.kind).toBe('numeric')
    expect(found.stored).toBeNull()
    expect(found.effective).toBe(2)
    expect(found.inheritedFrom).toBe(PARENT)
  })
})

describe('negative cells', () => {
  it('carry the resolved requirement and the same three states', () => {
    const rows = buildPermissionMatrix({
      chain: CHAIN,
      groups: [group(REGISTERED, 'Registered', { requiresPostApproval: true })],
      overrides: [
        { forumId: PARENT, groupId: REGISTERED, overrides: { requiresPostApproval: false } },
      ],
    })

    const found = cell(rows, REGISTERED, 'requiresPostApproval')
    expect(found.kind).toBe('negative')
    expect(found.stored).toBeNull()
    expect(found.control).toBe('inherit')
    expect(found.effective).toBe(false)
    expect(found.inheritedFrom).toBe(PARENT)
  })
})

describe('readMatrixCell', () => {
  const boolean = { key: 'canPostThreads', kind: 'boolean' } as never
  const numeric = { key: 'maxAttachmentsPerPost', kind: 'numeric' } as never
  const negative = { key: 'requiresThreadApproval', kind: 'negative' } as never

  it('reads the three states of a boolean', () => {
    expect(readMatrixCell(boolean, 'grant')).toBe(true)
    expect(readMatrixCell(boolean, 'deny')).toBe(false)
    expect(readMatrixCell(boolean, 'inherit')).toBeNull()
    expect(readMatrixCell(boolean, undefined)).toBeNull()
  })

  it('reads the three states of a requirement, never as a number', () => {
    expect(readMatrixCell(negative, 'grant')).toBe(true)
    expect(readMatrixCell(negative, 'deny')).toBe(false)
    expect(readMatrixCell(negative, 'inherit')).toBeNull()
    expect(readMatrixCell(negative, '')).toBeNull()
    expect(readMatrixCell(negative, undefined)).toBeNull()
    expect(readMatrixCell(negative, 'true')).toBeNull()
    expect(readMatrixCell(negative, 'false')).toBeNull()
  })

  it('reads a number, and an empty box as inherit', () => {
    expect(readMatrixCell(numeric, '5')).toBe(5)
    expect(readMatrixCell(numeric, '0')).toBe(0)
    expect(readMatrixCell(numeric, '')).toBeNull()
  })

  it('reads an unparseable number as inherit, never as zero', () => {
    expect(readMatrixCell(numeric, 'abc')).toBeNull()
    expect(readMatrixCell(numeric, '-1')).toBeNull()
    expect(readMatrixCell(numeric, '1.5')).toBeNull()
  })
})

describe('matrixCellValue', () => {
  it('renders explicit booleans and requirements as grant or deny, and null as inherit', () => {
    expect(matrixCellValue({ kind: 'boolean', stored: true })).toBe('grant')
    expect(matrixCellValue({ kind: 'boolean', stored: false })).toBe('deny')
    expect(matrixCellValue({ kind: 'boolean', stored: null })).toBe('inherit')
    expect(matrixCellValue({ kind: 'negative', stored: true })).toBe('grant')
    expect(matrixCellValue({ kind: 'negative', stored: false })).toBe('deny')
    expect(matrixCellValue({ kind: 'negative', stored: null })).toBe('inherit')
  })

  it('renders a stored number as itself, and null as an empty box', () => {
    expect(matrixCellValue({ kind: 'numeric', stored: 4 })).toBe('4')
    expect(matrixCellValue({ kind: 'numeric', stored: 0 })).toBe('0')
    expect(matrixCellValue({ kind: 'numeric', stored: null })).toBe('')
  })
})

describe('a stored negative override round-trips through the editor', () => {
  const field = { key: 'requiresApprovalOnEdit', kind: 'negative' } as never

  it('parses each rendered state back to the value it came from', () => {
    for (const stored of [true, false, null]) {
      const rendered = matrixCellValue({ kind: 'negative', stored })
      expect(readMatrixCell(field, rendered)).toBe(stored)
    }
  })

  it('is not wiped by a save that never touched it', () => {
    const overrides: ForumOverride[] = [
      { forumId: CHILD, groupId: REGISTERED, overrides: { requiresApprovalOnEdit: false } },
    ]
    const rows = buildPermissionMatrix({
      chain: CHAIN,
      groups: [group(REGISTERED, 'Registered')],
      overrides,
    })

    const found = cell(rows, REGISTERED, 'requiresApprovalOnEdit')
    expect(found.stored).toBe(false)
    expect(found.control).toBe('deny')
    expect(readMatrixCell(field, found.control)).toBe(false)
  })
})

describe('planCopyToDescendants', () => {
  const base = {
    sourceForumId: PARENT,
    descendantIds: [CHILD],
    groupIds: [REGISTERED],
  }

  it('reports exactly which cells would change, and on which forum', () => {
    const plan = planCopyToDescendants({
      ...base,
      overrides: [{ forumId: PARENT, groupId: REGISTERED, overrides: { canPostThreads: false } }],
    })

    expect(plan.changes).toEqual([
      {
        forumId: CHILD,
        groupId: REGISTERED,
        key: 'canPostThreads',
        from: null,
        to: false,
      },
    ])
    expect(plan.unchanged).toEqual([])
  })

  it('copies nulls too, so "copy" means identical', () => {
    const plan = planCopyToDescendants({
      ...base,
      overrides: [{ forumId: CHILD, groupId: REGISTERED, overrides: { canPostThreads: false } }],
    })

    expect(plan.changes).toEqual([
      { forumId: CHILD, groupId: REGISTERED, key: 'canPostThreads', from: false, to: null },
    ])
  })

  it('reports a descendant that is already identical as unchanged', () => {
    const plan = planCopyToDescendants({
      ...base,
      overrides: [
        { forumId: PARENT, groupId: REGISTERED, overrides: { canPostThreads: false } },
        { forumId: CHILD, groupId: REGISTERED, overrides: { canPostThreads: false } },
      ],
    })

    expect(plan.changes).toEqual([])
    expect(plan.unchanged).toEqual([CHILD])
  })

  it('covers every group it was given, not only those with a source row', () => {
    const plan = planCopyToDescendants({
      sourceForumId: PARENT,
      descendantIds: [CHILD],
      groupIds: [REGISTERED, STAFF],
      overrides: [{ forumId: CHILD, groupId: STAFF, overrides: { canPostThreads: true } }],
    })

    expect(plan.changes).toEqual([
      { forumId: CHILD, groupId: STAFF, key: 'canPostThreads', from: true, to: null },
    ])
  })

  it('is empty for a forum with no descendants', () => {
    const plan = planCopyToDescendants({ ...base, descendantIds: [], overrides: [] })
    expect(plan).toEqual({ changes: [], unchanged: [] })
  })
})

describe('buildFieldMatrix', () => {
  const rows = buildPermissionMatrix({
    chain: CHAIN,
    groups: [
      group(REGISTERED, 'Registered', { canPostThreads: true }),
      group(STAFF, 'Staff', { canPostThreads: false }),
    ],
    overrides: [{ forumId: CHILD, groupId: STAFF, overrides: { canPostThreads: true } }],
  })

  it('turns one row per group into one row per field, columns in group order', () => {
    const fields = buildFieldMatrix(rows)
    const row = fields.find((field) => field.key === 'canPostThreads')

    expect(row?.cells.map((c) => c.groupId)).toEqual([REGISTERED, STAFF])
  })

  it('carries the same values buildPermissionMatrix computed for each group', () => {
    const fields = buildFieldMatrix(rows)
    const row = fields.find((field) => field.key === 'canPostThreads')
    const staffCell = row?.cells.find((c) => c.groupId === STAFF)
    const original = cell(rows, STAFF, 'canPostThreads')

    expect(staffCell).toEqual({
      groupId: STAFF,
      name: matrixCellName(STAFF, 'canPostThreads'),
      stored: original.stored,
      control: original.control,
      effective: original.effective,
      inheritedFrom: original.inheritedFrom,
    })
  })

  it('gives every cell the same name matrixCellName would, for the form to read back', () => {
    const fields = buildFieldMatrix(rows)
    const row = fields.find((field) => field.key === 'canPostThreads')

    expect(row?.cells.map((c) => c.name)).toEqual([
      matrixCellName(REGISTERED, 'canPostThreads'),
      matrixCellName(STAFF, 'canPostThreads'),
    ])
  })

  it('keeps kind and description at the row, described once per field', () => {
    const fields = buildFieldMatrix(rows)
    const row = fields.find((field) => field.key === 'canPostThreads')

    expect(row?.kind).toBe('boolean')
    expect(row?.description.length).toBeGreaterThan(0)
  })

  it('covers every forum permission field, in the registry order', () => {
    const fields = buildFieldMatrix(rows)
    expect(fields.map((field) => field.key)).toEqual(
      buildPermissionMatrix({
        chain: CHAIN,
        groups: [group(REGISTERED, 'Registered')],
        overrides: [],
      })[0]?.cells.map((c) => c.key),
    )
  })
})

describe('matrixCellName', () => {
  it('combines the group and the field so the same field name never collides across groups', () => {
    expect(matrixCellName(REGISTERED, 'canPostThreads')).toBe('2:canPostThreads')
    expect(matrixCellName(STAFF, 'canPostThreads')).toBe('3:canPostThreads')
    expect(matrixCellName(REGISTERED, 'canPostThreads')).not.toBe(
      matrixCellName(STAFF, 'canPostThreads'),
    )
  })
})

describe('diffMatrixSubmission', () => {
  it('reports a group whose submission moves a cell from inherit to allow', () => {
    const changes = diffMatrixSubmission([], CHILD, [
      { groupId: REGISTERED, values: { canPostThreads: true } },
    ])

    expect(changes).toEqual([{ groupId: REGISTERED, values: { canPostThreads: true } }])
  })

  it('reports a group whose submission moves a cell from allow to inherit', () => {
    const current: ForumOverride[] = [
      { forumId: CHILD, groupId: REGISTERED, overrides: { canPostThreads: true } },
    ]
    const changes = diffMatrixSubmission(current, CHILD, [
      { groupId: REGISTERED, values: { canPostThreads: null } },
    ])

    expect(changes).toEqual([{ groupId: REGISTERED, values: { canPostThreads: null } }])
  })

  it('produces no write for a group whose submission repeats every stored value', () => {
    const current: ForumOverride[] = [
      { forumId: CHILD, groupId: REGISTERED, overrides: { canPostThreads: true } },
    ]
    const changes = diffMatrixSubmission(current, CHILD, [
      { groupId: REGISTERED, values: { canPostThreads: true } },
    ])

    expect(changes).toEqual([])
  })

  it('does not treat a group with no stored row and an all-inherit submission as changed', () => {
    const changes = diffMatrixSubmission([], CHILD, [
      { groupId: REGISTERED, values: { canPostThreads: null } },
    ])

    expect(changes).toEqual([])
  })

  it('only writes a stored row on a different forum when the change is for this forum', () => {
    const current: ForumOverride[] = [
      { forumId: PARENT, groupId: REGISTERED, overrides: { canPostThreads: true } },
    ]
    const changes = diffMatrixSubmission(current, CHILD, [
      { groupId: REGISTERED, values: { canPostThreads: null } },
    ])

    expect(changes).toEqual([])
  })

  it('reports every changed group, leaving the untouched ones out', () => {
    const current: ForumOverride[] = [
      { forumId: CHILD, groupId: REGISTERED, overrides: { canPostThreads: true } },
      { forumId: CHILD, groupId: STAFF, overrides: { canPostThreads: true } },
    ]
    const changes = diffMatrixSubmission(current, CHILD, [
      { groupId: REGISTERED, values: { canPostThreads: true } },
      { groupId: STAFF, values: { canPostThreads: false } },
    ])

    expect(changes).toEqual([{ groupId: STAFF, values: { canPostThreads: false } }])
  })
})
