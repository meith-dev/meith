import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { RateLimitOutcome } from '@meith/antispam'
import type { Actor } from '@meith/authorization'
import { combinePermissionSets, InMemoryAuthorizationSource } from '@meith/authorization'

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

const spends: Array<{ scope: string; userId: number | null }> = []
const outcomeRef: { current: RateLimitOutcome | null } = { current: null }
vi.mock('./antispam', () => ({
  spendLimit: async (input: { scope: string; actor: Actor }) => {
    spends.push({ scope: input.scope, userId: input.actor.userId })
    return outcomeRef.current
  },
  limitMessage: () => 'You have done that too many times. Try again in 20 minutes.',
}))

const uploads: Array<{ userId: number }> = []
vi.mock('./avatars', () => ({
  AVATAR_FIELD: 'avatar',
  canUploadAvatar: () => true,
  requireAvatarService: () => ({
    async upload(input: { userId: number }) {
      uploads.push(input)
    },
  }),
}))

const enqueued: string[] = []
vi.mock('@meith/drivers', () => ({
  drivers: () => ({
    queue: {
      async enqueue(kind: string) {
        enqueued.push(kind)
        return { id: '1', deduplicated: false }
      },
    },
  }),
}))

const { saveAvatarAction } = await import('./usercp-actions')
const { EMPTY_STATE } = await import('./auth-form-state')
const { SEED_BOARD, SEED_GROUP } = await import('./seed-board')
const { installTestContainer } = await import('./test-container')

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

function formWithImage(): FormData {
  const data = new FormData()
  data.append('avatar', new File([new Uint8Array(64)], 'face.png', { type: 'image/png' }))
  return data
}

async function run(data: FormData): Promise<{ redirectedTo?: string; error?: string }> {
  try {
    const state = await saveAvatarAction(EMPTY_STATE, data)
    return state.error === undefined ? {} : { error: state.error }
  } catch (err) {
    if (err instanceof RedirectError) return { redirectedTo: err.location }
    throw err
  }
}

beforeEach(async () => {
  spends.length = 0
  uploads.length = 0
  enqueued.length = 0
  outcomeRef.current = null
  actorRef.current = await actorFor(SEED_GROUP.registered, 1)
  installTestContainer()
})

describe('an avatar upload against the hourly upload limit', () => {
  it('spends the upload scope the setting names', async () => {
    const result = await run(formWithImage())

    expect(result.redirectedTo).toBe('/usercp/avatar?saved=processing')
    expect(spends).toEqual([{ scope: 'upload', userId: 1 }])
    expect(uploads).toHaveLength(1)
  })

  it('refuses the upload when the limit is spent', async () => {
    outcomeRef.current = { allowed: false, used: 5, retryAfterSeconds: 1200 }

    const result = await run(formWithImage())

    expect(result.error).toContain('too many times')
    expect(uploads).toEqual([])
    expect(enqueued).toEqual([])
  })

  it('spends nothing when no image was chosen', async () => {
    const result = await run(new FormData())

    expect(result.error).toContain('Choose an image')
    expect(spends).toEqual([])
  })
})
