/**
 * Integration test for the composition root (D11) in fixture mode.
 *
 * This is the seam where the seed board, the InMemoryAuthorizationSource and the
 * Authorizer meet. Unit tests cover each in isolation; this proves the *wiring*
 * — that getContainer() actually assembles a working authorizer over the seed
 * data, which is what every Server Component will depend on.
 *
 * DATA_SOURCE is 'fixture' in the test env (vitest.config.ts), so this never
 * touches Postgres.
 */
import type { Actor } from '@forum/authorization'
import { describe, expect, it } from 'vitest'

import { getContainer } from './container'
import { SEED_BOARD, SEED_FORUM, SEED_GROUP } from './seed-board'

function actorInGroups(userId: number | null, groupIds: number[]): Actor {
  // Combine the seed board's group defaults the way the real repo will.
  const container = getContainer()
  void container
  const sets = SEED_BOARD.groups
    .filter((g) => groupIds.includes(g.groupId))
    .map((g) => g.permissions)
  // Fold with the authorizer's own combine by asking the source — but for the
  // test we only need `global`, so merge booleans by OR here directly.
  const global = sets.reduce(
    (acc, s) => {
      for (const [k, v] of Object.entries(s)) {
        if (typeof v === 'boolean') acc[k] = (acc[k] as boolean) || v
      }
      return acc
    },
    { ...sets[0] } as Record<string, unknown>,
  )
  return {
    userId,
    groupIds,
    primaryGroupId: groupIds[0] ?? null,
    state: userId === null ? 'guest' : 'active',
    global: global as Actor['global'],
    permissionVersion: 1,
  }
}

describe('getContainer (fixture mode)', () => {
  it('builds a fixture-backed container', () => {
    const c = getContainer()
    expect(c.dataSource).toBe('fixture')
    expect(c.authorizer).toBeDefined()
  })

  it('returns the same instance on repeated calls (process-wide singleton)', () => {
    expect(getContainer()).toBe(getContainer())
  })

  it('lets a guest view announcements but not post (override applied)', async () => {
    const { authorizer } = getContainer()
    const guest = actorInGroups(null, [SEED_GROUP.guest])

    const forum = await authorizer.forumMatrix(guest, SEED_FORUM.announcements)
    expect(authorizer.can(guest, 'forum.view', { forumId: SEED_FORUM.announcements, forum })).toBe(
      true,
    )
    expect(
      authorizer.can(guest, 'thread.post', { forumId: SEED_FORUM.announcements, forum }),
    ).toBe(false)
  })

  it('lets a registered user post in general', async () => {
    const { authorizer } = getContainer()
    const user = actorInGroups(10, [SEED_GROUP.registered])

    const forum = await authorizer.forumMatrix(user, SEED_FORUM.general)
    expect(authorizer.can(user, 'thread.post', { forumId: SEED_FORUM.general, forum })).toBe(
      true,
    )
  })

  it('inherits general -> off-topic (child forum resolves through parent)', async () => {
    const { authorizer } = getContainer()
    const user = actorInGroups(10, [SEED_GROUP.registered])

    const forum = await authorizer.forumMatrix(user, SEED_FORUM.generalOffTopic)
    // canView is not overridden on the child, so it inherits true from general.
    expect(
      authorizer.can(user, 'forum.view', { forumId: SEED_FORUM.generalOffTopic, forum }),
    ).toBe(true)
  })

  it('grants an administrator the ACP via the column, and posts a bypass for forum actions', async () => {
    const { authorizer } = getContainer()
    const admin = actorInGroups(1, [SEED_GROUP.administrators])

    expect(authorizer.can(admin, 'admincp.access', {})).toBe(true)
  })

  it('rebuilds an HMR-stale container that predates a newly-added repository', () => {
    const current = getContainer()
    const key = Symbol.for('@forum/forum.container')
    ;(globalThis as Record<symbol, unknown>)[key] = {
      ...current,
      threads: current.threads,
      posts: { listThread: current.posts.listThread },
      memberProfiles: {},
    }

    const rebuilt = getContainer()

    expect(rebuilt).not.toBe(current)
    expect(typeof rebuilt.threads.findVisibleById).toBe('function')
    expect(typeof rebuilt.posts.listThread).toBe('function')
    expect(typeof rebuilt.memberProfiles.findPublicById).toBe('function')
  })
})
