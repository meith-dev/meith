import { describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ actorState: 'active' }))

vi.mock('./context', () => ({
  getActor: async () => ({
    userId: 42,
    state: state.actorState,
    global: { isAdministrator: true },
  }),
}))
vi.mock('./container', () => ({
  getContainer: () => ({
    modcp: {},
    warnings: {},
    authorizer: { can: () => true, moderatedForumIds: async () => [1] },
  }),
}))

const { resolveModCpAccess } = await import('./modcp')

describe('moderator panel account state', () => {
  it.each(['awaiting_activation', 'banned', 'guest'])(
    'denies %s administrators with an existing session',
    async (actorState) => {
      state.actorState = actorState
      expect(await resolveModCpAccess()).toBeNull()
    },
  )

  it('retains IP lookup for active administrators', async () => {
    state.actorState = 'active'
    expect(await resolveModCpAccess()).toMatchObject({ userId: 42, canLookUpIp: true })
  })
})
