import { describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  actor: null as { userId: number; state: string } | null,
}))

vi.mock('./container', () => ({
  getContainer: () => ({ actorSource: { buildForUser: async () => state.actor } }),
}))

const { apiActor } = await import('./api-auth')

describe('apiActor', () => {
  it('rejects a banned owner even when an older API token remains valid', async () => {
    state.actor = { userId: 42, state: 'banned' }
    expect(await apiActor(42)).toBeNull()
  })

  it('returns an available owner and rejects a missing owner', async () => {
    state.actor = { userId: 42, state: 'active' }
    expect(await apiActor(42)).toEqual(state.actor)
    state.actor = null
    expect(await apiActor(42)).toBeNull()
  })
})
