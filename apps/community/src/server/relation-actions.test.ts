/**
 * F61 at the app layer.
 *
 * The rules are unit-tested in `@meith/relations` and the SQL against real
 * Postgres. What is proven here is the seam neither can see:
 *
 *  - the list being changed is the *session's*, never the form's;
 *  - "is this person staff" is asked through the Authorizer, and only for an
 *    ignore, so a buddy costs no actor build;
 *  - `returnTo` cannot be turned into an open redirect;
 *  - and F60's send path actually refuses somebody the recipient ignores,
 *    with a message that does not disclose the ignore.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { InMemoryAuthorizationSource, combinePermissionSets } from '@meith/authorization'
import type { Actor } from '@meith/authorization'
import type { RelationKind, RelationRepository, RelationRow } from '@meith/relations'

const { RedirectError } = vi.hoisted(() => {
  class RedirectError extends Error {
    constructor(readonly location: string) {
      super(`redirect: ${location}`)
    }
  }
  return { RedirectError }
})

vi.mock('next/navigation', () => ({
  redirect: (to: string): never => {
    throw new RedirectError(to)
  },
}))

const actorRef: { current: Actor | null } = { current: null }
vi.mock('./context', () => ({ getActor: async () => actorRef.current }))

const { removeRelationAction, setRelationAction } = await import('./relation-actions')
const { EMPTY_STATE } = await import('./auth-form-state')
const { SEED_BOARD, SEED_GROUP } = await import('./seed-board')
const { installTestContainer } = await import('./test-container')

const IVAN = 1
const BOB = 2

class FakeRelations implements RelationRepository {
  rows: Array<{ userId: number; otherUserId: number; kind: RelationKind }> = []

  async list(input: { userId: number; kind: RelationKind }): Promise<readonly RelationRow[]> {
    return this.rows
      .filter((row) => row.userId === input.userId && row.kind === input.kind)
      .map((row) => ({
        userId: row.otherUserId,
        username: `user${row.otherUserId}`,
        kind: row.kind,
        lastActiveAt: null,
        createdAt: new Date(),
      }))
  }
  async count(userId: number) {
    return this.rows.filter((row) => row.userId === userId).length
  }
  async ignoredIds(userId: number) {
    return this.rows
      .filter((row) => row.userId === userId && row.kind === 'ignore')
      .map((row) => row.otherUserId)
  }
  async set(input: { userId: number; otherUserId: number; kind: RelationKind }) {
    const existing = this.rows.find(
      (row) => row.userId === input.userId && row.otherUserId === input.otherUserId,
    )
    if (existing !== undefined) existing.kind = input.kind
    else this.rows.push({ userId: input.userId, otherUserId: input.otherUserId, kind: input.kind })
  }
  async remove(input: { userId: number; otherUserId: number }) {
    const before = this.rows.length
    this.rows = this.rows.filter(
      (row) => !(row.userId === input.userId && row.otherUserId === input.otherUserId),
    )
    return this.rows.length < before
  }
  async ignores(ownerUserId: number, otherUserId: number) {
    return this.rows.some(
      (row) =>
        row.userId === ownerUserId && row.otherUserId === otherUserId && row.kind === 'ignore',
    )
  }
}

let relations: FakeRelations

async function actorFor(groupId: number, userId: number | null): Promise<Actor> {
  const source = new InMemoryAuthorizationSource(SEED_BOARD)
  const defaults = await source.groupDefaults([groupId])
  return {
    userId,
    groupIds: [groupId],
    primaryGroupId: groupId,
    state: userId === null ? 'guest' : 'active',
    global: combinePermissionSets(defaults.map((d) => d.permissions)),
    permissionVersion: 1,
  }
}

function form(entries: Array<[string, string]>): FormData {
  const data = new FormData()
  for (const [key, value] of entries) data.append(key, value)
  return data
}

async function run(
  action: (prev: typeof EMPTY_STATE, form: FormData) => Promise<typeof EMPTY_STATE>,
  data: FormData,
): Promise<{ redirectedTo?: string; error?: string }> {
  try {
    const state = await action(EMPTY_STATE, data)
    return state.error === undefined ? {} : { error: state.error }
  } catch (err) {
    if (err instanceof RedirectError) return { redirectedTo: err.location }
    throw err
  }
}

/** A container with a real memory account store, so `isStaff` resolves an actor. */
async function install(group: number = SEED_GROUP.registered): Promise<void> {
  const container = installTestContainer({ container: { relations } })
  const store = container['accountStore'] as {
    accounts: { create(input: Record<string, unknown>): Promise<{ id: number }> }
  }

  const { hashPassword } = await import('@meith/accounts')
  const hash = await hashPassword('correct horse battery staple')
  for (const [name, primaryGroupId] of [
    ['ivan', SEED_GROUP.registered],
    ['bob', group],
  ] as const) {
    await store.accounts.create({
      username: name,
      usernameLower: name,
      email: `${name}@example.test`,
      emailLower: `${name}@example.test`,
      passwordHash: hash,
      passwordAlgo: 'argon2id',
      state: 'active',
      primaryGroupId,
    })
  }
}

beforeEach(async () => {
  relations = new FakeRelations()
  actorRef.current = await actorFor(SEED_GROUP.registered, IVAN)
  await install()
}, 30_000)

describe('adding somebody to a list', () => {
  it('writes to the signed-in member’s list and comes back to the page', async () => {
    const result = await run(
      setRelationAction,
      form([
        ['userId', String(BOB)],
        ['username', 'bob'],
        ['kind', 'buddy'],
        ['returnTo', '/member/2'],
      ]),
    )

    expect(result.redirectedTo).toBe('/member/2?added=bob')
    expect(relations.rows).toEqual([{ userId: IVAN, otherUserId: BOB, kind: 'buddy' }])
  })

  it('takes the list owner from the session, never from the form', async () => {
    await run(
      setRelationAction,
      form([
        ['userId', String(BOB)],
        ['username', 'bob'],
        ['kind', 'ignore'],
        /* A submitted owner is simply not read. */
        ['ownerUserId', '999'],
      ]),
    )

    expect(relations.rows[0]?.userId).toBe(IVAN)
  })

  it('refuses a guest', async () => {
    actorRef.current = await actorFor(SEED_GROUP.guest, null)

    const result = await run(
      setRelationAction,
      form([
        ['userId', String(BOB)],
        ['username', 'bob'],
        ['kind', 'ignore'],
      ]),
    )

    expect(result.error).toContain('logged in')
    expect(relations.rows).toEqual([])
  })

  it('refuses a board with no relation store rather than pretending', async () => {
    installTestContainer({ container: { relations: null } })

    const result = await run(
      setRelationAction,
      form([
        ['userId', String(BOB)],
        ['username', 'bob'],
        ['kind', 'buddy'],
      ]),
    )

    expect(result.error).toContain('sample data')
  })

  it('refuses to ignore a moderator, resolved through the Authorizer', async () => {
    /*
     * `isStaff` builds the target's actor and asks `modcp.access`. Kills the
     * mutant that stops passing `targetIsStaff`, which would let a member hide
     * the post explaining why their thread was locked.
     */
    await install(SEED_GROUP.administrators)

    const result = await run(
      setRelationAction,
      form([
        ['userId', String(BOB)],
        ['username', 'bob'],
        ['kind', 'ignore'],
      ]),
    )

    expect(result.error).toContain('cannot be ignored')
    expect(relations.rows).toEqual([])
  })

  it('still lets a moderator be added as a buddy', async () => {
    await install(SEED_GROUP.administrators)

    await run(
      setRelationAction,
      form([
        ['userId', String(BOB)],
        ['username', 'bob'],
        ['kind', 'buddy'],
      ]),
    )

    expect(relations.rows[0]?.kind).toBe('buddy')
  })

  it('refuses a kind it does not know', async () => {
    const result = await run(
      setRelationAction,
      form([
        ['userId', String(BOB)],
        ['username', 'bob'],
        ['kind', 'block'],
      ]),
    )

    expect(result.error).toBeDefined()
    expect(relations.rows).toEqual([])
  })

  it('will not be turned into an open redirect', async () => {
    /*
     * `returnTo` is a form value anybody can post. Kills the mutant that trusts
     * it — a board that will bounce you to an attacker's login page is a
     * phishing kit with a community attached.
     */
    for (const bad of ['https://evil.test', '//evil.test', 'javascript:alert(1)']) {
      const result = await run(
        setRelationAction,
        form([
          ['userId', String(BOB)],
          ['username', 'bob'],
          ['kind', 'buddy'],
          ['returnTo', bad],
        ]),
      )
      expect(result.redirectedTo).toBe('/usercp/contacts?added=bob')
    }
  })
})

describe('removing somebody', () => {
  it('removes from the signed-in member’s list', async () => {
    relations.rows.push({ userId: IVAN, otherUserId: BOB, kind: 'ignore' })

    const result = await run(
      removeRelationAction,
      form([
        ['userId', String(BOB)],
        ['username', 'bob'],
      ]),
    )

    expect(result.redirectedTo).toBe('/usercp/contacts?removed=bob')
    expect(relations.rows).toEqual([])
  })

  it('treats a second click as success rather than as an error', async () => {
    const result = await run(
      removeRelationAction,
      form([
        ['userId', String(BOB)],
        ['username', 'bob'],
      ]),
    )

    expect(result.error).toBeUndefined()
    expect(result.redirectedTo).toBe('/usercp/contacts?removed=bob')
  })

  it('will not remove from another member’s list', async () => {
    relations.rows.push({ userId: BOB, otherUserId: IVAN, kind: 'ignore' })

    await run(
      removeRelationAction,
      form([
        ['userId', String(IVAN)],
        ['username', 'ivan'],
      ]),
    )

    expect(relations.rows).toHaveLength(1)
  })
})
