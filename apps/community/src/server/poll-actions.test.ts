import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Actor } from '@meith/authorization'
import { combinePermissionSets, InMemoryAuthorizationSource } from '@meith/authorization'
import type { Poll, PollRepository, PollVote } from '@meith/polls'

import { PROGRESSIVE_FIELD } from '@/view/progressive-enhancement'

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

const { votePollAction } = await import('./poll-actions')
const { SEED_BOARD, SEED_FORUM, SEED_GROUP } = await import('./seed-board')
const { installTestContainer } = await import('./test-container')

const THREAD = 20
const POLL = 5
const VOTER = 7

class FakePolls implements PollRepository {
  private readonly options: Array<{ id: number; label: string; votesBy: Set<number> }>
  allowRevote = false
  publicVotes = false
  maxOptions = 1
  closesAt: Date | null = null

  constructor(labels: readonly string[]) {
    this.options = labels.map((label, index) => ({
      id: index + 1,
      label,
      votesBy: new Set<number>(),
    }))
  }

  async create(): Promise<void> {}

  async find(threadId: number, voterUserId: number | null): Promise<Poll | null> {
    if (threadId !== THREAD) return null

    return {
      id: POLL,
      threadId: THREAD,
      question: 'Ship it?',
      closesAt: this.closesAt,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      maxOptions: this.maxOptions,
      allowRevote: this.allowRevote,
      publicVotes: this.publicVotes,
      options: this.options.map((option) => ({
        id: option.id,
        label: option.label,
        votes: option.votesBy.size,
        voters: [...option.votesBy].map((userId) => ({
          userId,
          username: `user${userId}`,
          votedAt: null,
        })),
      })),
      votedOptionIds:
        voterUserId === null
          ? []
          : this.options.filter((option) => option.votesBy.has(voterUserId)).map((o) => o.id),
    }
  }

  async vote(input: PollVote): Promise<boolean> {
    for (const option of this.options) option.votesBy.delete(input.userId)
    for (const id of input.optionIds) {
      this.options.find((option) => option.id === id)?.votesBy.add(input.userId)
    }
    return true
  }

  async applyEdit(): Promise<boolean> {
    return true
  }
}

let polls: FakePolls

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

function form(fields: Record<string, string | string[]>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    for (const one of Array.isArray(value) ? value : [value]) data.append(key, one)
  }
  return data
}

function install(visibility: 'visible' | 'unapproved' | 'deleted' = 'visible'): void {
  installTestContainer({
    overrides: [
      {
        forumId: SEED_FORUM.general,
        groupId: SEED_GROUP.registered,
        overrides: { canVotePolls: true },
      },
    ],
    container: {
      polls,
      threads: {
        locate: async () => ({ forumId: SEED_FORUM.general, authorUserId: 1, visibility }),
        findById: async () => ({ id: THREAD }),
        listForum: async () => ({ rows: [], nextCursor: null }),
      },
      forums: {
        listAll: async () => [],
        listListing: async () => [],
        findById: async () => ({ id: SEED_FORUM.general, type: 'forum' }),
      },
    },
  })
}

beforeEach(async () => {
  polls = new FakePolls(['Yes', 'No'])
  actorRef.current = await actorFor(SEED_GROUP.registered, VOTER)
  install()
})

describe('votePollAction', () => {
  it('casts the vote and redirects to the thread on a plain submit', async () => {
    await expect(
      votePollAction(null, form({ threadId: String(THREAD), pollId: String(POLL), optionId: '1' })),
    ).rejects.toThrow(RedirectError)

    const fresh = await polls.find(THREAD, VOTER)
    expect(fresh?.votedOptionIds).toEqual([1])
  })

  it('refuses to vote on a thread the member cannot see', async () => {
    install('deleted')

    await expect(
      votePollAction(null, form({ threadId: String(THREAD), pollId: String(POLL), optionId: '1' })),
    ).rejects.toThrow()

    const fresh = await polls.find(THREAD, VOTER)
    expect(fresh?.votedOptionIds).toEqual([])
  })

  it('casts the vote and returns the fresh results without redirecting when enhanced', async () => {
    const result = await votePollAction(
      null,
      form({
        threadId: String(THREAD),
        pollId: String(POLL),
        optionId: '1',
        [PROGRESSIVE_FIELD]: '1',
      }),
    )

    expect(result?.options.find((option) => option.id === 1)?.votes).toBe(1)
    expect(result?.options.find((option) => option.id === 1)?.checked).toBe(true)
    expect(result?.hasVoted).toBe(true)
    expect(result?.mayCast).toBe(false)
  })

  it('keeps casting available after an enhanced vote when the poll allows a revote', async () => {
    polls.allowRevote = true

    const result = await votePollAction(
      null,
      form({
        threadId: String(THREAD),
        pollId: String(POLL),
        optionId: '1',
        [PROGRESSIVE_FIELD]: '1',
      }),
    )

    expect(result?.mayCast).toBe(true)
  })

  it('refuses a guest whether or not the submit is enhanced', async () => {
    actorRef.current = await actorFor(SEED_GROUP.guest, null)

    await expect(
      votePollAction(
        null,
        form({
          threadId: String(THREAD),
          pollId: String(POLL),
          optionId: '1',
          [PROGRESSIVE_FIELD]: '1',
        }),
      ),
    ).rejects.toThrow(/logged/)
  })
})
