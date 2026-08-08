/**
 * F66's writes, at the app layer.
 *
 * The SQL is proven against real Postgres in `@meith/db`; what is proven here
 * is what only this adapter can get wrong.
 *
 * Three things, and the first is the reason the permission editor is checkboxes
 * rather than the three-state control F65 uses:
 *
 *  - **an unticked box is a revocation, not an absence.** A checkbox submits
 *    nothing when it is off, so an action that read only the fields that
 *    arrived could never turn a permission off — the operator would untick it,
 *    press save, and watch it come back;
 *  - **the version tag is cleared on every write**, because a group *is*
 *    permissions and F20 caches resolved actors against it;
 *  - **the chunk cursor survives the round trip**, which is what makes a long
 *    membership run resumable without JavaScript.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PERMISSION_FIELDS } from '@meith/core'

const adminCalls: Array<{ action: string; detail: unknown }> = []
const requireAdminMock = vi.fn(async () => ({ userId: 1 }))
const requireFreshAdminMock = vi.fn(async () => ({ userId: 1 }))
/*
 * The group writes clear Next's client Router Cache for the screens that list
 * groups — see `invalidatePermissions`. Recorded rather than ignored, so the
 * test can say which paths were refreshed.
 */
const revalidated: string[] = []
vi.mock('next/cache', () => ({
  revalidatePath: (path: string) => {
    revalidated.push(path)
  },
}))

vi.mock('./admin', () => ({
  requireAdmin: () => requireAdminMock(),
  requireFreshAdmin: () => requireFreshAdminMock(),
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

const saved: Array<{ groupId: number; permissions: Record<string, boolean | number> }> = []
const identities: Array<{ groupId: number; input: Record<string, unknown> }> = []
const created: Array<Record<string, unknown>> = []
const removed: Array<{ groupId: number; moveTo: number }> = []
const chunks: Array<Record<string, number>> = []

const chunkResult = { current: { moved: 2, nextCursor: 7 as number | null } }
const applied = { current: { outcomes: [{ userId: 1 }], examined: 9 } }

vi.mock('./group-admin', () => ({
  requireGroupAdmin: () => ({
    async savePermissions(groupId: number, permissions: Record<string, boolean | number>) {
      saved.push({ groupId, permissions })
    },
    async updateIdentity(groupId: number, input: Record<string, unknown>) {
      identities.push({ groupId, input })
    },
    async create(input: Record<string, unknown>) {
      created.push(input)
      return 42
    },
    async remove(groupId: number, moveTo: number) {
      removed.push({ groupId, moveTo })
    },
    async moveMembersChunk(input: Record<string, number>) {
      chunks.push(input)
      return chunkResult.current
    },
  }),
  promotionService: () => ({
    async apply() {
      return applied.current
    },
  }),
}))

const {
  applyPromotionsAction,
  createGroupAction,
  deleteGroupAction,
  moveMembersAction,
  saveGroupIdentityAction,
  saveGroupPermissionsAction,
} = await import('./group-admin-actions')

function form(fields: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.append(key, value)
  return data
}

beforeEach(() => {
  adminCalls.length = 0
  invalidated.length = 0
  revalidated.length = 0
  saved.length = 0
  identities.length = 0
  created.length = 0
  removed.length = 0
  chunks.length = 0
  chunkResult.current = { moved: 2, nextCursor: 7 }
  applied.current = { outcomes: [{ userId: 1 }], examined: 9 }
  requireAdminMock.mockClear()
  requireAdminMock.mockResolvedValue({ userId: 1 })
  requireFreshAdminMock.mockClear()
  requireFreshAdminMock.mockResolvedValue({ userId: 1 })
})

describe('the admin gate', () => {
  it('is asked for on every write, not left to the layout', async () => {
    /*
     * A Server Action is a public endpoint reachable without rendering any
     * page, so F63's rule applies to each one separately. Kills the mutant that
     * drops the call from any of them.
     */
    await saveGroupPermissionsAction({}, form({ groupId: '2' }))
    await saveGroupIdentityAction({}, form({ groupId: '2', title: 'T', displayOrder: '0' }))
    await createGroupAction({}, form({ key: 'k', title: 'T', copyFromGroupId: '2' }))
    expect(requireAdminMock).toHaveBeenCalledTimes(3)
  })

  it('re-authenticates the three bulk operations', async () => {
    /*
     * Deleting a group, moving members en masse and running promotions all
     * change what a population of members may do, with no undo and no visible
     * blast radius. `requireAdmin` is not enough for those — F63 built
     * `requireFreshAdmin` for exactly this shape.
     */
    await deleteGroupAction({}, form({ groupId: '8', moveMembersTo: '2' }))
    await moveMembersAction({}, form({ fromGroupId: '2', toGroupId: '3' }))
    await applyPromotionsAction({}, form({}))

    expect(requireFreshAdminMock).toHaveBeenCalledTimes(3)
    expect(requireAdminMock).not.toHaveBeenCalled()
  })

  it('writes nothing when it refuses', async () => {
    requireAdminMock.mockRejectedValue(
      Object.assign(new Error('nope'), { code: 'FORBIDDEN', publicMessage: 'nope' }),
    )

    const state = await saveGroupPermissionsAction({}, form({ groupId: '2' }))

    expect(state.error).toBeDefined()
    expect(saved).toEqual([])
    expect(invalidated).toEqual([])
  })
})

describe('saveGroupPermissionsAction', () => {
  it('reads an unticked box as a revocation rather than as an absence', async () => {
    /*
     * The claim the checkbox editor rests on. An off checkbox submits nothing,
     * so an action that iterated only the submitted fields could never turn a
     * permission off — the operator would untick, save, and see it return.
     * Kills the mutant that reads `form.entries()` instead of the registry.
     */
    const boolean = PERMISSION_FIELDS.find((field) => field.kind === 'boolean')
    await saveGroupPermissionsAction({}, form({ groupId: '2' }))

    const written = saved[0]?.permissions ?? {}
    expect(Object.keys(written).sort()).toEqual(
      PERMISSION_FIELDS.map((field) => field.key).sort(),
    )
    expect(written[boolean!.key]).toBe(false)
  })

  it('keeps a ticked box ticked', async () => {
    await saveGroupPermissionsAction({}, form({ groupId: '2', canView: '1' }))
    expect(saved[0]?.permissions.canView).toBe(true)
  })

  it('takes numerics as numbers, and blank as the registry fallback', async () => {
    const numeric = PERMISSION_FIELDS.find((field) => field.kind === 'numeric')!
    await saveGroupPermissionsAction({}, form({ groupId: '2', [numeric.key]: '25' }))
    expect(saved[0]?.permissions[numeric.key]).toBe(25)

    await saveGroupPermissionsAction({}, form({ groupId: '2' }))
    expect(saved[1]?.permissions[numeric.key]).toBe(numeric.fallback)
  })

  it('refuses a numeric that is not a whole number, rather than storing NaN', async () => {
    const numeric = PERMISSION_FIELDS.find((field) => field.kind === 'numeric')!
    const state = await saveGroupPermissionsAction(
      {},
      form({ groupId: '2', [numeric.key]: 'lots' }),
    )

    expect(state.error).toBeDefined()
    expect(saved).toEqual([])
  })

  it('refuses a negative numeric', async () => {
    const numeric = PERMISSION_FIELDS.find((field) => field.kind === 'numeric')!
    const state = await saveGroupPermissionsAction(
      {},
      form({ groupId: '2', [numeric.key]: '-1' }),
    )

    expect(state.error).toBeDefined()
    expect(saved).toEqual([])
  })

  it('clears the permission tag', async () => {
    /*
     * The bump is the repository's, in the same transaction as the write; this
     * is the other half — the caches holding the old number have to be told to
     * let go. Kills the mutant that drops the invalidation.
     */
    await saveGroupPermissionsAction({}, form({ groupId: '2' }))
    expect(invalidated).toEqual([['permissions']])
  })

  it('logs the group but not the permissions', async () => {
    await saveGroupPermissionsAction({}, form({ groupId: '2', canView: '1' }))
    expect(adminCalls[0]).toEqual({
      action: 'group.permissions_changed',
      detail: { groupId: 2 },
    })
  })
})

describe('saveGroupIdentityAction', () => {
  it('clears the tag for a rename too', async () => {
    /*
     * The badge and the staff flag ride on the same resolved actor, so the
     * invalidation is unconditional rather than a judgement about which columns
     * are "really" permissions.
     */
    await saveGroupIdentityAction(
      {},
      form({ groupId: '2', title: 'Members', displayOrder: '5' }),
    )

    expect(identities[0]?.input).toMatchObject({ title: 'Members', displayOrder: 5 })
    expect(invalidated).toEqual([['permissions']])
  })

  it('refuses an empty title', async () => {
    const state = await saveGroupIdentityAction({}, form({ groupId: '2', displayOrder: '0' }))
    expect(state.error).toBeDefined()
    expect(identities).toEqual([])
  })

  it('stores a blank description and badge as null, not as an empty string', async () => {
    /*
     * The columns are nullable and every reader treats null as "none". An empty
     * string would render as a badge with no name rather than as no badge.
     */
    await saveGroupIdentityAction(
      {},
      form({ groupId: '2', title: 'T', displayOrder: '0', description: '', badgeToken: '' }),
    )
    expect(identities[0]?.input).toMatchObject({ description: null, badgeToken: null })
  })
})

describe('createGroupAction', () => {
  it('requires a copy source, so a new group is never deny-everything', async () => {
    /*
     * The registry defaults deny everything, so a group made from them is one
     * whose members cannot see the board.
     */
    const state = await createGroupAction({}, form({ key: 'veterans', title: 'V' }))
    expect(state.error).toBeDefined()
    expect(created).toEqual([])
  })

  it('names the field when the copy source was simply not chosen', async () => {
    /*
     * The select's blank first option used to fall through to the shared
     * `groupId` helper and come back as *"No such group."*, which tells somebody
     * who picked nothing that the group they picked has vanished. Found by the
     * audit of 7 August 2026; the form is `noValidate` on purpose, so the server
     * is the only place this message can be right.
     */
    const state = await createGroupAction(
      {},
      form({ key: 'veterans', title: 'V', copyFromGroupId: '' }),
    )

    expect(state.error).toMatch(/choose a group to copy permissions from/i)
    expect(state.error).not.toMatch(/no such group/i)
    expect(created).toEqual([])
  })

  it('refuses a key that is not an identifier', async () => {
    /*
     * The key is how code names the group. Kills the mutant that drops the
     * pattern check: a key with a space or a dot in it is one that cannot be
     * referred to from anywhere it would need to be.
     */
    for (const key of ['Veterans', '2fast', 'has space', 'has.dot', '']) {
      const state = await createGroupAction({}, form({ key, title: 'V', copyFromGroupId: '2' }))
      expect(state.error, key).toBeDefined()
    }
    expect(created).toEqual([])
  })

  it('creates when the key and the source are both good', async () => {
    const state = await createGroupAction(
      {},
      form({ key: 'veterans', title: 'Veterans', copyFromGroupId: '2' }),
    )

    expect(state.notice).toBe('created')
    expect(created[0]).toEqual({ key: 'veterans', title: 'Veterans', copyFromGroupId: 2 })
    expect(adminCalls[0]?.detail).toEqual({ groupId: 42, key: 'veterans' })
  })

  it('refreshes the listing the new group belongs in', async () => {
    /*
     * The board's own cache being clear does not refresh a payload the browser
     * already holds, so without this the operator saw "Created." beside a list
     * the group was missing from — the shape the audit found on the community tree,
     * and the reason this is checked here too.
     */
    await createGroupAction(
      {},
      form({ key: 'veterans', title: 'Veterans', copyFromGroupId: '2' }),
    )

    expect(revalidated).toContain('/admin/groups')
  })
})

describe('deleteGroupAction', () => {
  it('requires somewhere for the members to go', async () => {
    /*
     * `users.primary_group_id` is NOT NULL. A delete without a destination
     * either fails on the constraint or takes the members with it.
     */
    const state = await deleteGroupAction({}, form({ groupId: '8' }))
    expect(state.error).toBeDefined()
    expect(removed).toEqual([])
  })

  it('passes both groups through and clears the tag', async () => {
    const state = await deleteGroupAction({}, form({ groupId: '8', moveMembersTo: '2' }))
    expect(state.notice).toBe('deleted')
    expect(removed).toEqual([{ groupId: 8, moveTo: 2 }])
    expect(invalidated).toEqual([['permissions']])
  })
})

describe('moveMembersAction', () => {
  it('starts at the beginning and hands back where it stopped', async () => {
    /*
     * The cursor is the whole mechanism: it travels in the form, so the next
     * press continues the run with no JavaScript involved. Kills the mutant
     * that drops it from the returned state, which would restart the run from
     * zero on every press.
     */
    const state = await moveMembersAction({}, form({ fromGroupId: '2', toGroupId: '3' }))

    expect(chunks[0]).toEqual({
      fromGroupId: 2,
      toGroupId: 3,
      afterUserId: 0,
      limit: 500,
    })
    expect(state.notice).toBe('more')
    expect(state.values).toEqual({
      fromGroupId: '2',
      toGroupId: '3',
      afterUserId: '7',
      movedSoFar: '2',
    })
  })

  it('resumes from the cursor the form carried, and accumulates the total', async () => {
    const state = await moveMembersAction(
      {},
      form({ fromGroupId: '2', toGroupId: '3', afterUserId: '7', movedSoFar: '2' }),
    )

    expect(chunks[0]?.afterUserId).toBe(7)
    expect(state.values?.movedSoFar).toBe('4')
  })

  it('says it is finished when the chunk came back short', async () => {
    /*
     * `nextCursor: null` is the repository saying the source is exhausted.
     * Reporting that as "more" would leave an operator pressing a button that
     * does nothing, unsure whether the run had finished.
     */
    chunkResult.current = { moved: 1, nextCursor: null }
    const state = await moveMembersAction({}, form({ fromGroupId: '2', toGroupId: '3' }))

    expect(state.notice).toBe('finished')
  })

  it('refuses a cursor that is not a whole number', async () => {
    const state = await moveMembersAction(
      {},
      form({ fromGroupId: '2', toGroupId: '3', afterUserId: 'wat' }),
    )

    expect(state.error).toBeDefined()
    expect(chunks).toEqual([])
  })

  it('clears the tag on every chunk, not only the last', async () => {
    /*
     * A run that stops half way has still changed real permissions, and the
     * actors holding the old ones have to go.
     */
    await moveMembersAction({}, form({ fromGroupId: '2', toGroupId: '3' }))
    await moveMembersAction(
      {},
      form({ fromGroupId: '2', toGroupId: '3', afterUserId: '7', movedSoFar: '2' }),
    )

    expect(invalidated).toEqual([['permissions'], ['permissions']])
  })
})

describe('applyPromotionsAction', () => {
  it('runs the service and reports how many it moved', async () => {
    const state = await applyPromotionsAction({}, form({}))

    expect(state.notice).toBe('promoted:1')
    expect(invalidated).toEqual([['permissions']])
    expect(adminCalls[0]).toEqual({
      action: 'group.promotions_applied',
      detail: { promoted: 1, examined: 9 },
    })
  })
})
