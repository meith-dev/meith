/**
 * F65's matrix model.
 *
 * The claims that matter are about *what an operator is shown*, because the
 * failure mode of a permission editor is never a crash — it is somebody
 * confidently setting the wrong thing. So: inherit is distinguishable from
 * deny, an inherited cell says where the value came from, a row resolves for
 * its own group and not for the combination, and a copy is previewed exactly.
 */
import { describe, expect, it } from 'vitest'

import { emptyPermissionSet, type PermissionSet } from '@forum/core'

import {
  buildPermissionMatrix,
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

/** `[child, parent, root]` — nearest first, as the resolver expects. */
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
    /*
     * `inheritedFrom: null` with `stored: null` is a *different* explanation
     * from "inherited from the parent" — it means the group's own default — and
     * the screen has to word it differently. Kills the mutant that reports the
     * forum itself as the source.
     */
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
    /*
     * The whole point of three states. A two-state checkbox would have to show
     * this as "off", and saving the form would write an explicit `false` here —
     * pinning the child forever and making a later change at the parent do
     * nothing.
     */
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
    /*
     * Kills the mutant that reports the *forum itself* as an ancestor, which
     * would render "inherited from this forum" on every explicit cell.
     */
    const found = cell(rows, REGISTERED, 'canPostThreads')
    expect(found.stored).toBe(false)
    expect(found.effective).toBe(false)
    expect(found.inheritedFrom).toBeNull()
  })
})

describe('a row resolves for its own group only', () => {
  it('does not show one group the value another group would win', () => {
    /*
     * `Authorizer.forumMatrix` combines across an actor's groups — booleans OR.
     * A matrix editor must not: the operator is editing the Registered row, and
     * showing them `true` because Staff has it would make the cell a lie about
     * the thing they are about to change. Kills the mutant that passes every
     * group to the resolver at once.
     */
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

describe('readMatrixCell', () => {
  const boolean = { key: 'canPostThreads', kind: 'boolean' } as never
  const numeric = { key: 'maxAttachmentsPerPost', kind: 'numeric' } as never

  it('reads the three states of a boolean', () => {
    expect(readMatrixCell(boolean, 'grant')).toBe(true)
    expect(readMatrixCell(boolean, 'deny')).toBe(false)
    expect(readMatrixCell(boolean, 'inherit')).toBeNull()
    expect(readMatrixCell(boolean, undefined)).toBeNull()
  })

  it('reads a number, and an empty box as inherit', () => {
    expect(readMatrixCell(numeric, '5')).toBe(5)
    expect(readMatrixCell(numeric, '0')).toBe(0)
    expect(readMatrixCell(numeric, '')).toBeNull()
  })

  it('reads an unparseable number as inherit, never as zero', () => {
    /*
     * 0 is meaningful — it is *unlimited* (R4.2) — so a typo coerced to 0 would
     * silently grant the opposite of what was typed. Kills the mutant that
     * uses `Number(raw) || 0`.
     */
    expect(readMatrixCell(numeric, 'abc')).toBeNull()
    expect(readMatrixCell(numeric, '-1')).toBeNull()
    expect(readMatrixCell(numeric, '1.5')).toBeNull()
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
      overrides: [
        { forumId: PARENT, groupId: REGISTERED, overrides: { canPostThreads: false } },
      ],
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
    /*
     * The cautious-sounding alternative — copy only the non-nulls — is wrong: a
     * child that explicitly denies something the parent inherits would keep
     * denying it, and the operator who pressed "copy" would be looking at two
     * forums that are not the same. Kills the mutant that skips null sources.
     */
    const plan = planCopyToDescendants({
      ...base,
      overrides: [
        { forumId: CHILD, groupId: REGISTERED, overrides: { canPostThreads: false } },
      ],
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
    /*
     * A group the source forum does not override still has to be copied — the
     * copy is "make them the same", and the descendant may well have a value
     * that the source does not.
     */
    const plan = planCopyToDescendants({
      sourceForumId: PARENT,
      descendantIds: [CHILD],
      groupIds: [REGISTERED, STAFF],
      overrides: [
        { forumId: CHILD, groupId: STAFF, overrides: { canPostThreads: true } },
      ],
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
