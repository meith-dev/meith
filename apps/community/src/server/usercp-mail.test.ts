import { beforeEach, describe, expect, it, vi } from 'vitest'

import { type OutgoingMail, resetEnvForTests } from '@meith/core'
import { EN_CATALOG, sourceTranslator } from '@meith/i18n'

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
  values: {
    'board.name': 'The Townland',
    'mail.from_name': '',
    'board.url': '',
    'board.logo_light': '',
    'board.logo_dark': '',
    'board.logo_alt': '',
  } as Record<string, string>,
}))

vi.mock('./settings', () => ({
  getSettings: async () => ({ get: (key: string) => settings.values[key] }),
}))

const { sendEmailChangeConfirmation, sendEmailChangeNotice } = await import('./usercp-mail')

const T = sourceTranslator(EN_CATALOG)

const CHANGE = {
  previousEmail: 'ivan@example.test',
  email: 'new@example.test',
  t: T,
}

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
  settings.values = {
    'board.name': 'The Townland',
    'mail.from_name': '',
    'board.url': '',
    'board.logo_light': '',
    'board.logo_dark': '',
    'board.logo_alt': '',
  }
})

describe('sendEmailChangeNotice', () => {
  it('goes to the address being left, not the one being adopted', async () => {
    await withOrigin('https://board.example', () =>
      sendEmailChangeNotice({ ...CHANGE, stage: 'requested' }),
    )

    expect(sent.mail[0]?.to).toBe('ivan@example.test')
  })

  it('names the address the account is moving to', async () => {
    await withOrigin('https://board.example', () =>
      sendEmailChangeNotice({ ...CHANGE, stage: 'requested' }),
    )

    expect(sent.mail[0]?.text).toContain('new@example.test')
  })

  it('carries no token and no confirmation link, so reading it changes nothing', async () => {
    await withOrigin('https://board.example', () =>
      sendEmailChangeNotice({ ...CHANGE, stage: 'requested' }),
    )

    const text = sent.mail[0]!.text
    expect(text).not.toContain('token=')
    expect(text).not.toContain('/usercp/email/confirm')
  })

  it('points a request at the password reset form, which ends every session', async () => {
    await withOrigin('https://board.example', () =>
      sendEmailChangeNotice({ ...CHANGE, stage: 'requested' }),
    )

    const mail = sent.mail[0]!
    expect(mail.subject).toBe('[The Townland] Your e-mail address is being changed')
    expect(mail.text).toContain('Reset your password')
    expect(mail.text).toContain('https://board.example/reset')
  })

  it('points an adoption at the board, because this address can no longer reset', async () => {
    await withOrigin('https://board.example', () =>
      sendEmailChangeNotice({ ...CHANGE, stage: 'adopted' }),
    )

    const mail = sent.mail[0]!
    expect(mail.subject).toBe('[The Townland] Your e-mail address was changed')
    expect(mail.text).toContain('https://board.example/')
    expect(mail.text).not.toContain('/reset')
  })

  it('renders through the board’s own template, like every other message', async () => {
    await withOrigin('https://board.example', () =>
      sendEmailChangeNotice({ ...CHANGE, stage: 'requested' }),
    )

    const mail = sent.mail[0]!
    expect(mail.html).toContain('<!doctype html')
    expect(mail.html).toContain('The Townland')
    expect(mail.html).toContain('https://board.example/reset')
    expect(mail.html).toContain('Sent by The Townland.')
  })

  it('carries the same words in both parts, so a text-only client loses nothing', async () => {
    await withOrigin('https://board.example', () =>
      sendEmailChangeNotice({ ...CHANGE, stage: 'adopted' }),
    )

    const mail = sent.mail[0]!
    for (const part of [mail.text, mail.html]) {
      expect(part).toContain('new@example.test')
      expect(part).toContain('can no longer reset')
    }
  })

  it('degrades to instructions when the board has no address configured', async () => {
    await withOrigin(undefined, () => sendEmailChangeNotice({ ...CHANGE, stage: 'requested' }))

    const text = sent.mail[0]!.text
    expect(text).not.toContain('http')
    expect(text).toContain('forgot your password')
  })

  it('carries the board’s sender name when one is set', async () => {
    settings.values['mail.from_name'] = 'The Townland'

    await withOrigin('https://board.example', () =>
      sendEmailChangeNotice({ ...CHANGE, stage: 'adopted' }),
    )

    expect(sent.mail[0]?.fromName).toBe('The Townland')
  })

  it('swallows a send failure, so a dead provider cannot undo the change', async () => {
    sent.fail = true

    await expect(
      withOrigin('https://board.example', () =>
        sendEmailChangeNotice({ ...CHANGE, stage: 'adopted' }),
      ),
    ).resolves.toBeUndefined()
  })
})

describe('sendEmailChangeConfirmation', () => {
  it('goes to the new address with the link that redeems the token', async () => {
    await withOrigin('https://board.example', () =>
      sendEmailChangeConfirmation({ email: 'new@example.test', token: 'tok-123', t: T }),
    )

    const mail = sent.mail[0]!
    expect(mail.to).toBe('new@example.test')
    expect(mail.text).toContain('https://board.example/usercp/email/confirm?token=tok-123')
  })
})
