import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SettingsSnapshot } from '@meith/settings'

const state = vi.hoisted(() => ({ claimed: new Set<string>(), unavailable: false }))
vi.mock('./settings', () => ({
  getSettings: async () =>
    SettingsSnapshot.fromOverrides(
      new Map([
        ['antispam.captcha_mode', 'question'],
        ['antispam.min_form_seconds', '0'],
      ]),
    ),
}))
vi.mock('./container', () => ({ getContainer: () => ({ dataSource: 'postgres' }) }))
vi.mock('@meith/db', () => ({
  getDb: () => ({}),
  PostgresRateLimitBucketStore: class {},
  PostgresCaptchaQuestionRepository: class {
    async active() {
      return [{ id: 1, question: 'Two plus two?', answers: ['four', '4'] }]
    }
    async claimChallenge(token: string) {
      if (state.unavailable) throw new Error('database offline')
      if (state.claimed.has(token)) return false
      state.claimed.add(token)
      return true
    }
  },
}))

const { issueChallenge, verifyChallenge } = await import('./antispam')

beforeEach(() => {
  state.claimed.clear()
  state.unavailable = false
})

async function form(): Promise<FormData> {
  const issued = await issueChallenge()
  const data = new FormData()
  data.set('_issued', String(issued.issuedAt))
  data.set('_challenge', issued.challenge!.token)
  data.set('challenge_answer', 'four')
  return data
}

describe('registration CAPTCHA proofs', () => {
  it('accepts a successful proof once across separately constructed providers', async () => {
    const data = await form()
    const outcomes = await Promise.all(Array.from({ length: 10 }, () => verifyChallenge(data)))
    expect(outcomes.filter((outcome) => outcome.ok)).toHaveLength(1)
    expect(await verifyChallenge(await form())).toEqual({ ok: true })
  })

  it('rejects a static question ID and an edited proof', async () => {
    const data = await form()
    data.set('_challenge', `${data.get('_challenge')}x`)
    expect(await verifyChallenge(data)).toMatchObject({ ok: false })
    data.set('_challenge', '1')
    expect(await verifyChallenge(data)).toMatchObject({ ok: false })
  })

  it('does not consume the proof for an incorrect answer', async () => {
    const data = await form()
    data.set('challenge_answer', 'five')
    expect(await verifyChallenge(data)).toMatchObject({ ok: false })
    data.set('challenge_answer', 'four')
    expect(await verifyChallenge(data)).toEqual({ ok: true })
  })

  it('rejects verification when the shared claim store is unavailable', async () => {
    const data = await form()
    state.unavailable = true
    expect(await verifyChallenge(data)).toMatchObject({ ok: false })
  })
})
