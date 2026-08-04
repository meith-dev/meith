import { ValidationError } from '@meith/core'
import { beforeEach, describe, expect, it } from 'vitest'

import { RelationService, suppress } from './service'
import { MAX_RELATIONS, isOnline, parseRelationKind } from './types'
import type { RelationKind, RelationRepository, RelationRow } from './types'

const ME = 1
const THEM = 2

class FakeRepository implements RelationRepository {
  rows: RelationRow[] = []

  async list(input: { userId: number; kind: RelationKind }) {
    void input.userId
    return this.rows.filter((row) => row.kind === input.kind)
  }
  async count() {
    return this.rows.length
  }
  async ignoredIds() {
    return this.rows.filter((row) => row.kind === 'ignore').map((row) => row.userId)
  }
  async set(input: {
    userId: number
    otherUserId: number
    kind: RelationKind
    at: Date
  }) {
    const existing = this.rows.find((row) => row.userId === input.otherUserId)
    if (existing !== undefined) {
      this.rows = this.rows.map((row) =>
        row.userId === input.otherUserId ? { ...row, kind: input.kind } : row,
      )
      return
    }
    this.rows.push({
      userId: input.otherUserId,
      username: `user${input.otherUserId}`,
      kind: input.kind,
      lastActiveAt: null,
      createdAt: input.at,
    })
  }
  async remove(input: { userId: number; otherUserId: number }) {
    void input.userId
    const before = this.rows.length
    this.rows = this.rows.filter((row) => row.userId !== input.otherUserId)
    return this.rows.length < before
  }
  async ignores(_ownerUserId: number, otherUserId: number) {
    return this.rows.some((row) => row.userId === otherUserId && row.kind === 'ignore')
  }
}

let repo: FakeRepository
let service: RelationService

beforeEach(() => {
  repo = new FakeRepository()
  service = new RelationService({ relations: repo, now: () => new Date('2026-08-01T12:00:00Z') })
})

describe('set', () => {
  it('adds somebody to a list', async () => {
    await service.set({ userId: ME, otherUserId: THEM, kind: 'buddy' })
    expect(repo.rows.map((row) => [row.userId, row.kind])).toEqual([[THEM, 'buddy']])
  })

  it('moves somebody between the lists in one write', async () => {
    /*
     * The two are mutually exclusive, which the primary key enforces. A delete
     * followed by an insert could half happen and leave nobody on either list.
     */
    await service.set({ userId: ME, otherUserId: THEM, kind: 'ignore' })
    await service.set({ userId: ME, otherUserId: THEM, kind: 'buddy' })

    expect(repo.rows).toHaveLength(1)
    expect(repo.rows[0]?.kind).toBe('buddy')
  })

  it('refuses to put you on your own list', async () => {
    await expect(
      service.set({ userId: ME, otherUserId: ME, kind: 'ignore' }),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('refuses to ignore staff, rather than doing it and having no effect', async () => {
    /*
     * A moderator's post is often the one saying why a thread was locked. A
     * member who believes they have hidden it, and has not, is worse off than
     * one who was told.
     */
    await expect(
      service.set({ userId: ME, otherUserId: THEM, kind: 'ignore', targetIsStaff: true }),
    ).rejects.toThrow(/cannot be ignored/)
    expect(repo.rows).toEqual([])
  })

  it('still lets staff be added as a buddy', async () => {
    await service.set({ userId: ME, otherUserId: THEM, kind: 'buddy', targetIsStaff: true })
    expect(repo.rows).toHaveLength(1)
  })

  it('refuses a new name once the lists are full', async () => {
    repo.rows = Array.from({ length: MAX_RELATIONS }, (_, i) => ({
      userId: 100 + i,
      username: `user${i}`,
      kind: 'buddy' as const,
      lastActiveAt: null,
      createdAt: new Date(),
    }))

    await expect(
      service.set({ userId: ME, otherUserId: THEM, kind: 'buddy' }),
    ).rejects.toThrow(/full/)
  })

  it('still lets somebody already on a full list be moved between them', async () => {
    /*
     * Kills the mutant that checks the ceiling without asking whether this
     * person is already on the list — which would strand a full list, unable to
     * move anybody from ignore to buddy or back.
     */
    repo.rows = Array.from({ length: MAX_RELATIONS }, (_, i) => ({
      userId: i === 0 ? THEM : 100 + i,
      username: `user${i}`,
      kind: 'ignore' as const,
      lastActiveAt: null,
      createdAt: new Date(),
    }))

    await service.set({ userId: ME, otherUserId: THEM, kind: 'buddy' })
    expect(repo.rows.find((row) => row.userId === THEM)?.kind).toBe('buddy')
  })
})

describe('remove', () => {
  it('reports whether there was anything to remove', async () => {
    await service.set({ userId: ME, otherUserId: THEM, kind: 'buddy' })
    expect(await service.remove(ME, THEM)).toBe(true)
    expect(await service.remove(ME, THEM)).toBe(false)
  })
})

describe('suppress', () => {
  const base = {
    authorUserId: THEM,
    viewerUserId: ME,
    ignoredIds: new Set([THEM]),
    revealedPostIds: new Set<number>(),
    postId: 10,
  }

  it('hides a post by somebody the viewer ignores', () => {
    expect(suppress(base)).toBe(true)
  })

  it('shows it once the viewer has revealed that post', () => {
    expect(suppress({ ...base, revealedPostIds: new Set([10]) })).toBe(false)
  })

  it('keeps hiding the other posts by the same author', () => {
    /*
     * Reveal is per post, not per author. Kills the mutant that reveals
     * everybody's posts once one is revealed — which would make a single click
     * undo the whole feature for that thread.
     */
    expect(suppress({ ...base, revealedPostIds: new Set([10]), postId: 11 })).toBe(true)
  })

  it('never hides your own post', () => {
    /* You can end up ignoring somebody you have quoted; hiding your own words
       back at you is nonsense. */
    expect(suppress({ ...base, authorUserId: ME })).toBe(false)
  })

  it('shows a post by somebody who is not ignored', () => {
    expect(suppress({ ...base, ignoredIds: new Set([999]) })).toBe(false)
  })

  it('shows a post whose author no longer exists', () => {
    expect(suppress({ ...base, authorUserId: null })).toBe(false)
  })

  it('shows everything to a guest', () => {
    expect(suppress({ ...base, viewerUserId: null, ignoredIds: new Set() })).toBe(false)
  })
})

describe('isOnline', () => {
  const now = new Date('2026-08-01T12:00:00Z')

  it('counts somebody seen inside the window', () => {
    expect(isOnline(new Date('2026-08-01T11:50:00Z'), now)).toBe(true)
  })

  it('does not count somebody seen before it', () => {
    expect(isOnline(new Date('2026-08-01T11:40:00Z'), now)).toBe(false)
  })

  it('does not count somebody who has never been seen', () => {
    /*
     * `last_active_at` had no writer before F61, so on an existing board this
     * is everybody until their next visit. "Never seen" must read as offline
     * rather than as an error.
     */
    expect(isOnline(null, now)).toBe(false)
  })
})

describe('parseRelationKind', () => {
  it('accepts the two kinds and refuses anything else', () => {
    expect(parseRelationKind('buddy')).toBe('buddy')
    expect(parseRelationKind('ignore')).toBe('ignore')
    expect(parseRelationKind('block')).toBeNull()
    expect(parseRelationKind('')).toBeNull()
  })
})
