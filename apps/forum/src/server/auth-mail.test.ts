import { beforeEach, describe, expect, it, vi } from 'vitest'

import { resetEnvForTests, type OutgoingMail } from '@meith/core'

const sent = vi.hoisted(() => ({ mail: [] as OutgoingMail[], fail: false }))

vi.mock('@meith/drivers', () => ({
  drivers: () => ({
    mail: {
      send: async (mail: OutgoingMail) => {
        if (sent.fail) throw new Error('provider is down')
        sent.mail.push(mail)
      },
    },
  }),
}))

const settings = vi.hoisted(() => ({
  values: { 'board.name': 'The Townland', 'mail.from_name': '' } as Record<string, string>,
}))

vi.mock('./settings', () => ({
  getSettings: async () => ({ get: (key: string) => settings.values[key] }),
}))

const { sendPasswordResetEmail, sendVerificationEmail } = await import('./auth-mail')

const RECIPIENT = { email: 'ivan@example.test', username: 'ivan' }

async function withOrigin<T>(origin: string | undefined, body: () => Promise<T>): Promise<T> {
  vi.stubEnv('APP_URL', origin)
  resetEnvForTests()
  try {
    return await body()
  } finally {
    vi.unstubAllEnvs()
    resetEnvForTests()
  }
}

beforeEach(() => {
  sent.mail.length = 0
  sent.fail = false
  settings.values = { 'board.name': 'The Townland', 'mail.from_name': '' }
})

describe('sendVerificationEmail', () => {
  it('builds a link to the route that redeems the token', async () => {
    await withOrigin('https://board.example', () =>
      sendVerificationEmail({ ...RECIPIENT, token: 'tok-123' }),
    )

    const mail = sent.mail[0]!
    expect(mail.to).toBe(RECIPIENT.email)
    expect(mail.subject).toBe('[The Townland] Confirm your account')
    expect(mail.text).toContain('https://board.example/verify?token=tok-123')
    expect(mail.text).toContain('24 hours')
  })

  it('strips trailing slashes rather than emitting a double slash', async () => {
    await withOrigin('https://board.example//', () =>
      sendVerificationEmail({ ...RECIPIENT, token: 'tok' }),
    )
    expect(sent.mail[0]?.text).toContain('https://board.example/verify?token=tok')
  })

  it('percent-encodes the token', async () => {
    await withOrigin('https://board.example', () =>
      sendVerificationEmail({ ...RECIPIENT, token: 'a b&c' }),
    )
    expect(sent.mail[0]?.text).toContain('/verify?token=a%20b%26c')
  })

  it('degrades to instructions when no origin is configured', async () => {
    await withOrigin(undefined, () => sendVerificationEmail({ ...RECIPIENT, token: 'tok' }))

    const text = sent.mail[0]!.text
    expect(text).not.toContain('/verify?token=')
    expect(text).toContain('resend confirmation')
  })

  it('carries the board\u2019s sender name when one is set', async () => {
    settings.values['mail.from_name'] = 'The Townland'

    await withOrigin('https://board.example', () =>
      sendVerificationEmail({ ...RECIPIENT, token: 'tok' }),
    )

    expect(sent.mail[0]?.fromName).toBe('The Townland')
  })

  it('omits the sender name when the board has not set one', async () => {
    await withOrigin('https://board.example', () =>
      sendVerificationEmail({ ...RECIPIENT, token: 'tok' }),
    )
    expect(sent.mail[0]?.fromName).toBeUndefined()
  })

  it('reports a send failure to its caller', async () => {
    sent.fail = true
    await expect(
      withOrigin('https://board.example', () =>
        sendVerificationEmail({ ...RECIPIENT, token: 'tok' }),
      ),
    ).rejects.toThrow(/provider is down/)
  })
})

describe('sendPasswordResetEmail', () => {
  it('links to the confirm route that already exists', async () => {
    await withOrigin('https://board.example', () =>
      sendPasswordResetEmail({ ...RECIPIENT, token: 'reset-tok' }),
    )

    const mail = sent.mail[0]!
    expect(mail.subject).toBe('[The Townland] Reset your password')
    expect(mail.text).toContain('https://board.example/reset/confirm?token=reset-tok')
  })

  it('degrades to instructions when no origin is configured', async () => {
    await withOrigin(undefined, () => sendPasswordResetEmail({ ...RECIPIENT, token: 'tok' }))
    expect(sent.mail[0]?.text).not.toContain('/reset/confirm?token=')
  })
})
