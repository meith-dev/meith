/**
 * The precedence rule, and what "configured" means.
 *
 * Both are decisions that used to be spread across `resolve.ts`, a health view
 * and an installer, each with its own idea of when a board can send. The tests
 * that matter here are the ones asserting they cannot disagree again: the
 * environment's veto, and the fact that a *partially* filled transport is not a
 * working one — which is the state a real board ends up in, because somebody
 * pastes a key and forgets the sender address.
 */
import { describe, expect, it } from 'vitest'

import {
  MAIL_PRESETS,
  canSendMail,
  describeMailConfig,
  mailConfigFromEnvironment,
  mailConfigFromSettings,
  mailConfigProblems,
  resolveMailConfig,
  type MailEnvironment,
} from './mail'
import { SettingsSnapshot } from './store'

/** A settings snapshot with the given overrides applied over the registry. */
function board(overrides: Record<string, string> = {}): SettingsSnapshot {
  return SettingsSnapshot.fromOverrides(new Map(Object.entries(overrides)))
}

const SMTP_BOARD = {
  'mail.transport': 'smtp',
  'mail.from': 'noreply@board.example',
  'mail.smtp_host': 'smtp.provider.example',
  'mail.smtp_port': '465',
  'mail.smtp_security': 'tls',
  'mail.smtp_username': 'board',
  'mail.smtp_password': 'hunter2hunter2',
}

const HTTP_ENV: MailEnvironment = {
  MAIL_DRIVER: 'http',
  MAIL_FROM: 'noreply@env.example',
  MAIL_HTTP_ENDPOINT: 'https://api.resend.com/emails',
  MAIL_HTTP_TOKEN: 're_from_the_environment',
}

describe('mailConfigFromEnvironment', () => {
  it('declines to answer when MAIL_DRIVER is log or absent', () => {
    /*
     * `null`, not a log config. "The environment does not configure mail" and
     * "the environment configures mail to send nothing" are different claims,
     * and only the first defers to the database — collapse them and a board
     * whose compose file forwards MAIL_DRIVER=${MAIL_DRIVER:-log} can never be
     * configured from its own panel.
     */
    expect(mailConfigFromEnvironment({})).toBeNull()
    expect(mailConfigFromEnvironment({ MAIL_DRIVER: 'log' })).toBeNull()
  })

  it('reads an HTTP transport', () => {
    expect(mailConfigFromEnvironment(HTTP_ENV)).toEqual({
      transport: 'http',
      from: 'noreply@env.example',
      endpoint: 'https://api.resend.com/emails',
      token: 're_from_the_environment',
    })
  })

  it('defaults an SMTP port from the security mode rather than guessing 25', () => {
    expect(
      mailConfigFromEnvironment({
        MAIL_DRIVER: 'smtp',
        MAIL_FROM: 'noreply@env.example',
        MAIL_SMTP_HOST: 'smtp.env.example',
        MAIL_SMTP_SECURITY: 'tls',
      }),
    ).toMatchObject({ port: 465, security: 'tls' })

    expect(
      mailConfigFromEnvironment({
        MAIL_DRIVER: 'smtp',
        MAIL_FROM: 'noreply@env.example',
        MAIL_SMTP_HOST: 'smtp.env.example',
      }),
    ).toMatchObject({ port: 587, security: 'starttls' })
  })
})

describe('resolveMailConfig', () => {
  it('lets the environment win outright, ignoring a fully configured board', () => {
    const resolution = resolveMailConfig({
      environment: HTTP_ENV,
      settings: board(SMTP_BOARD),
    })

    expect(resolution.source).toBe('environment')
    expect(resolution.config.transport).toBe('http')
  })

  it('uses the board when MAIL_DRIVER says nothing', () => {
    const resolution = resolveMailConfig({
      environment: { MAIL_DRIVER: 'log' },
      settings: board(SMTP_BOARD),
    })

    expect(resolution.source).toBe('board')
    expect(resolution.config).toEqual({
      transport: 'smtp',
      from: 'noreply@board.example',
      host: 'smtp.provider.example',
      port: 465,
      security: 'tls',
      username: 'board',
      password: 'hunter2hunter2',
    })
  })

  it('resolves a fresh board to sending nothing', () => {
    const resolution = resolveMailConfig({ environment: {}, settings: board() })

    expect(resolution.source).toBe('board')
    expect(resolution.config).toEqual({ transport: 'log' })
    expect(canSendMail(resolution.config)).toBe(false)
    /* No problems: "not configured" is a state, not a misconfiguration. */
    expect(resolution.problems).toEqual([])
  })
})

describe('mailConfigProblems', () => {
  it('names a missing sender address, which is the one everybody forgets', () => {
    const problems = mailConfigProblems({
      transport: 'http',
      from: '',
      endpoint: 'https://api.resend.com/emails',
      token: 're_key',
    })
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('sender address')
  })

  it('names every missing piece rather than the first', () => {
    /*
     * A list, because "mail is not configured" is the message that wastes an
     * afternoon. Somebody who is missing two things should be told about two.
     */
    expect(
      mailConfigProblems({ transport: 'http', from: '', endpoint: '', token: '' }),
    ).toHaveLength(3)
  })

  it('accepts an unauthenticated relay, which is a real deployment', () => {
    /*
     * Postfix on the same machine takes no credentials. Requiring them would
     * refuse the one configuration a self-hoster can set up with no third party
     * at all.
     */
    expect(
      mailConfigProblems({
        transport: 'smtp',
        from: 'noreply@board.example',
        host: 'localhost',
        port: 25,
        security: 'none',
        username: '',
        password: '',
      }),
    ).toEqual([])
  })

  it('refuses half a credential, which is always a typo', () => {
    const base = {
      transport: 'smtp',
      from: 'noreply@board.example',
      host: 'smtp.example',
      port: 587,
      security: 'starttls',
    } as const

    expect(mailConfigProblems({ ...base, username: 'board', password: '' })).toHaveLength(1)
    expect(mailConfigProblems({ ...base, username: '', password: 'pw' })).toHaveLength(1)
  })

  it('rejects a port outside the range a socket can use', () => {
    expect(
      mailConfigProblems({
        transport: 'smtp',
        from: 'noreply@board.example',
        host: 'smtp.example',
        port: 0,
        security: 'starttls',
        username: '',
        password: '',
      }),
    ).toHaveLength(1)
  })
})

describe('describeMailConfig', () => {
  /*
   * This string is rendered in the panel, written to the audit log and printed
   * by the CLI. "Never carries the credential" is therefore a property it has to
   * keep rather than one each caller has to remember.
   */
  it('never contains the credential', () => {
    expect(describeMailConfig({ ...HTTP_ENV, transport: 'http', from: 'a@b.example', endpoint: 'https://api.resend.com/emails', token: 're_secret_value' })).not.toContain(
      're_secret_value',
    )

    expect(
      describeMailConfig({
        transport: 'smtp',
        from: 'a@b.example',
        host: 'smtp.example',
        port: 465,
        security: 'tls',
        username: 'board',
        password: 'hunter2',
      }),
    ).not.toContain('hunter2')
  })

  it('survives an endpoint that is not a URL', () => {
    /* Reached with a hand-edited settings row, and must not throw on a page. */
    expect(
      describeMailConfig({ transport: 'http', from: 'a@b.example', endpoint: 'nonsense', token: 'k' }),
    ).toContain('nonsense')
  })
})

describe('the preset list', () => {
  it('gives every SMTP preset a port and a security mode that agree', () => {
    /*
     * The pairing is the whole point of presets. A row offering 465 with
     * STARTTLS would teach the exact mistake `MailSecurity` documents, on the
     * screen that exists to save somebody from making it.
     */
    for (const preset of MAIL_PRESETS.filter((p) => p.transport === 'smtp')) {
      if (preset.port === undefined) continue
      expect(preset.security).toBeDefined()
      expect(preset.port).toBe(preset.security === 'tls' ? 465 : 587)
    }
  })

  it('gives every HTTP preset an endpoint or admits it has none', () => {
    for (const preset of MAIL_PRESETS.filter((p) => p.transport === 'http')) {
      if (preset.endpoint !== undefined) {
        expect(() => new URL(preset.endpoint!)).not.toThrow()
      }
    }
  })

  it('has unique ids, since one is stored as the operator’s choice', () => {
    expect(new Set(MAIL_PRESETS.map((p) => p.id)).size).toBe(MAIL_PRESETS.length)
  })
})

describe('mailConfigFromSettings', () => {
  it('falls back to sending nothing for a transport it does not know', () => {
    /*
     * A hand-edited row, or one written by a future release and read by an older
     * binary. `SettingsSnapshot` already replaces an unparseable value with the
     * default; this is the second gate, and it fails closed.
     */
    expect(mailConfigFromSettings(board({ 'mail.transport': 'carrier-pigeon' }))).toEqual({
      transport: 'log',
    })
  })

  it('trims values, because a pasted key arrives with a newline', () => {
    const config = mailConfigFromSettings(
      board({
        'mail.transport': 'http',
        'mail.from': ' noreply@board.example ',
        'mail.http_endpoint': 'https://api.resend.com/emails',
        'mail.http_token': 're_key\n',
      }),
    )

    expect(config).toMatchObject({ from: 'noreply@board.example', token: 're_key' })
  })
})
