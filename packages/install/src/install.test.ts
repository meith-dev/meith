import { describe, expect, it } from 'vitest'

import {
  INSTALL_STEPS,
  blockers,
  canProceed,
  defaultForumSlug,
  ECHOED_FIELDS,
  fieldErrorsFromReport,
  firstFailure,
  freshReport,
  stepTitle,
  installed,
  installInputFromForm,
  INSTALL_FIELDS,
  MAIL_SKIP,
  mailConfigFromInstallInput,
  parseInstallInput,
  preflight,
  SECRET_FIELDS,
  warnings,
  withEnvironmentAnswers,
  type PreflightProbe,
} from './index'

function ready(overrides: Partial<PreflightProbe> = {}): PreflightProbe {
  return {
    dataSource: 'postgres',
    databaseUrl: 'postgresql://user:pw@aws-0-eu-west-1.pooler.supabase.com:6543/postgres',
    hasAuthSecret: true,
    hasTickSecret: true,
    publicUrl: 'https://board.example',
    mail: {
      configured: true,
      source: 'board',
      summary: 'SMTP to smtp.example:587 (starttls), from noreply@board.example',
    },
    canConnect: true,
    pendingMigrations: 23,
    userCount: 0,
    alreadyInstalled: false,
    ...overrides,
  }
}

const idsOf = (checks: readonly { id: string }[]) => checks.map((check) => check.id)

describe('the preflight on a ready board', () => {
  it('reports no blockers and no warnings', () => {
    const checks = preflight(ready())
    expect(blockers(checks)).toEqual([])
    expect(warnings(checks)).toEqual([])
    expect(canProceed(checks)).toBe(true)
  })

  it('reports the pending migration count without blocking on it', () => {
    const checks = preflight(ready({ pendingMigrations: 1 }))
    expect(checks.find((check) => check.id === 'migrations')?.title).toBe(
      '1 migration will be applied',
    )
    expect(canProceed(checks)).toBe(true)
  })

  it('says nothing about migrations when the count is unknown', () => {
    expect(idsOf(preflight(ready({ pendingMigrations: null })))).not.toContain('migrations')
  })
})

describe('blockers', () => {
  it('refuses a board on in-memory sample data', () => {
    const checks = preflight(ready({ dataSource: 'fixture' }))
    expect(idsOf(blockers(checks))).toContain('data-source')
    expect(canProceed(checks)).toBe(false)
  })

  it.each([null, ''])('refuses a DATABASE_URL of %o', (databaseUrl) => {
    expect(idsOf(blockers(preflight(ready({ databaseUrl }))))).toContain('database-url')
  })

  it('refuses when the database would not accept a connection', () => {
    expect(idsOf(blockers(preflight(ready({ canConnect: false }))))).toContain('connect')
  })

  it('says nothing about connecting when no attempt was made', () => {
    expect(idsOf(preflight(ready({ canConnect: null })))).not.toContain('connect')
  })

  it('refuses a missing AUTH_SECRET', () => {
    expect(idsOf(blockers(preflight(ready({ hasAuthSecret: false }))))).toContain('auth-secret')
  })

  it('refuses a board that is already installed', () => {
    const checks = preflight(ready({ alreadyInstalled: true }))
    expect(idsOf(blockers(checks))).toContain('already-installed')
    expect(canProceed(checks)).toBe(false)
  })

  it('refuses a board that has accounts even when the marker is absent', () => {
    const checks = preflight(ready({ alreadyInstalled: false, userCount: 1 }))
    expect(idsOf(blockers(checks))).toContain('has-members')
    expect(canProceed(checks)).toBe(false)
  })

  it('counts accounts in the message, singular and plural', () => {
    const one = preflight(ready({ userCount: 1 })).find((c) => c.id === 'has-members')
    const many = preflight(ready({ userCount: 4 })).find((c) => c.id === 'has-members')
    expect(one?.detail).toContain('is 1 account')
    expect(many?.detail).toContain('are 4 accounts')
  })

  it('does not block when the account count is unknown', () => {
    expect(idsOf(preflight(ready({ userCount: null })))).not.toContain('has-members')
  })

  it('reports every blocker at once rather than the first', () => {
    const checks = preflight(
      ready({ dataSource: 'fixture', hasAuthSecret: false, canConnect: false }),
    )
    expect(idsOf(blockers(checks)).sort()).toEqual(['auth-secret', 'connect', 'data-source'])
  })
})

describe('warnings — the dangerous category', () => {
  it('warns about a missing TICK_SECRET without blocking', () => {
    const checks = preflight(ready({ hasTickSecret: false }))
    expect(idsOf(warnings(checks))).toContain('tick-secret')
    expect(canProceed(checks)).toBe(true)
  })

  it('says nothing about the connection string beyond it being set', () => {
    const direct = idsOf(preflight(ready({ databaseUrl: 'postgresql://u:p@db:5432/forum' })))
    expect(direct).toContain('database-url')
    expect(direct).not.toContain('pooler')
  })

  it('never lets a warning stop the install', () => {
    const checks = preflight(
      ready({
        databaseUrl: 'postgresql://u:p@db.example.com:5432/forum',
        hasTickSecret: false,
        mail: {
          configured: false,
          source: 'board',
          summary: 'Not sending — messages are written to the server log',
        },
      }),
    )
    expect(warnings(checks)).toHaveLength(2)
    expect(canProceed(checks)).toBe(true)
  })
})

describe('the step plan', () => {
  it('ends by disabling the installer', () => {
    expect(INSTALL_STEPS.at(-1)?.id).toBe('seal')
  })

  it('applies migrations before anything that needs a table', () => {
    expect(INSTALL_STEPS[0]?.id).toBe('migrate')
    expect(idsOf(INSTALL_STEPS).indexOf('settings')).toBeLessThan(
      idsOf(INSTALL_STEPS).indexOf('admin'),
    )
  })

  it('creates a forum, so a fresh board does not look broken', () => {
    expect(idsOf(INSTALL_STEPS)).toContain('forum')
  })

  it('starts every step pending', () => {
    expect(freshReport().every((step) => step.status === 'pending')).toBe(true)
    expect(freshReport()).toHaveLength(INSTALL_STEPS.length)
  })

  it('is not installed until every step is done', () => {
    expect(installed(freshReport())).toBe(false)

    const done = INSTALL_STEPS.map((step) => ({ id: step.id, status: 'done' as const }))
    expect(installed(done)).toBe(true)

    expect(installed(done.slice(0, -1))).toBe(false)
  })

  it('reports the first failure only', () => {
    const report = [
      { id: 'migrate', status: 'done' as const },
      { id: 'settings', status: 'failed' as const, error: 'first' },
      { id: 'admin', status: 'failed' as const, error: 'second' },
    ]
    expect(firstFailure(report)?.error).toBe('first')
    expect(firstFailure(freshReport())).toBeNull()
  })

  it('gives every step a title a screen can print', () => {
    for (const step of INSTALL_STEPS) {
      expect(stepTitle(step.id)).toBe(step.title)
      expect(stepTitle(step.id)).not.toBe(step.id)
    }
  })

  it('falls back to the id for a step it does not know', () => {
    expect(stepTitle('nonexistent')).toBe('nonexistent')
  })
})

describe('a step that refused an answer', () => {
  it('re-aims the message at the box that caused it', () => {
    const report = [
      { id: 'migrate', status: 'done' as const },
      { id: 'settings', status: 'done' as const },
      {
        id: 'admin',
        status: 'failed' as const,
        error: 'That username is reserved.',
        field: 'username',
      },
    ]

    expect(fieldErrorsFromReport(report)).toEqual({
      username: 'That username is reserved.',
    })
  })

  it('contributes no field error when the step simply broke', () => {
    const report = [
      { id: 'migrate', status: 'failed' as const, error: 'connection refused' },
    ]
    expect(fieldErrorsFromReport(report)).toEqual({})
  })

  it('says nothing about a report with nothing wrong in it', () => {
    expect(fieldErrorsFromReport(freshReport())).toEqual({})
    expect(
      fieldErrorsFromReport(INSTALL_STEPS.map((s) => ({ id: s.id, status: 'done' as const }))),
    ).toEqual({})
  })

  it('follows the first failure when a report carries two', () => {
    const report = [
      { id: 'settings', status: 'failed' as const, error: 'first', field: 'boardName' },
      { id: 'admin', status: 'failed' as const, error: 'second', field: 'username' },
    ]
    expect(fieldErrorsFromReport(report)).toEqual({ boardName: 'first' })
  })
})

describe('the report a screen renders', () => {
  it('covers every step, in the order the steps are declared', () => {
    expect(idsOf(freshReport())).toEqual(idsOf(INSTALL_STEPS))
  })

  it('starts with nothing claimed, so it reads as a description', () => {
    expect(freshReport().every((step) => step.status === 'pending')).toBe(true)
    expect(firstFailure(freshReport())).toBeNull()
  })

  it('is joinable to the step list by id alone', () => {
    const titles = new Map(INSTALL_STEPS.map((step) => [step.id, step.title]))
    for (const outcome of freshReport()) {
      expect(titles.get(outcome.id)).toBeDefined()
    }
  })
})

describe('the form', () => {
  const valid = {
    boardName: 'The Bike Shed',
    username: 'wren',
    email: 'wren@example.test',
    boardUrl: 'https://board.example',
    password: 'a-long-enough-password',
  }

  it('accepts a complete form and trims what it keeps', () => {
    const result = parseInstallInput({ ...valid, boardName: '  The Bike Shed  ' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.boardName).toBe('The Bike Shed')
  })

  it.each([
    ['boardName', ''],
    ['username', 'ab'],
    ['email', 'not-an-email'],
    ['password', 'short'],
  ])('refuses a bad %s', (field, value) => {
    const result = parseInstallInput({ ...valid, [field]: value })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(Object.keys(result.errors)).toContain(field)
  })

  it('asks more of the administrator’s password than of a member’s', () => {
    expect(parseInstallInput({ ...valid, password: 'elevenchar' }).ok).toBe(false)
    expect(parseInstallInput({ ...valid, password: 'twelvechars!' }).ok).toBe(true)
  })

  it('reports one message per field rather than a stack', () => {
    const result = parseInstallInput({ boardName: '', username: '', email: '', password: '' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      for (const message of Object.values(result.errors)) {
        expect(message).not.toContain('\n')
      }
    }
  })

  it('reports every empty field at once, so the form is filled in one pass', () => {
    const result = parseInstallInput({})
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(Object.keys(result.errors).sort()).toEqual([
        'boardName',
        'boardUrl',
        'email',
        'password',
        'username',
      ])
    }
  })
})

describe('the first forum’s slug', () => {
  it('comes from the board name', () => {
    expect(defaultForumSlug('The Bike Shed')).toBe('the-bike-shed')
    expect(defaultForumSlug('Board  &  Friends!')).toBe('board-friends')
  })

  it('falls back rather than producing an empty path', () => {
    expect(defaultForumSlug('日本語')).toBe('general')
    expect(defaultForumSlug('!!!')).toBe('general')
    expect(defaultForumSlug('')).toBe('general')
  })

  it('does not produce a leading or trailing hyphen', () => {
    expect(defaultForumSlug('  Hello  ')).toBe('hello')
    expect(defaultForumSlug('---x---')).toBe('x')
  })

  it('bounds the length', () => {
    expect(defaultForumSlug('a'.repeat(200)).length).toBeLessThanOrEqual(40)
  })
})

describe('the mail half of the form', () => {
  const valid = {
    boardName: 'The Bike Shed',
    username: 'wren',
    email: 'wren@example.test',
    boardUrl: 'https://board.example',
    password: 'a-long-enough-password',
  }

  it('installs a board with no mail when the operator skips', () => {
    const result = parseInstallInput({ ...valid, mailPreset: MAIL_SKIP })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(mailConfigFromInstallInput(result.value)).toEqual({ transport: 'log' })
    }
  })

  it('reads a blank security select as "use the preset\u2019s", not as an error', () => {
    expect(parseInstallInput({ ...valid, mailPreset: MAIL_SKIP, mailSecurity: '' }).ok).toBe(
      true,
    )

    const chosen = parseInstallInput({
      ...valid,
      mailPreset: 'resend-smtp',
      mailFrom: 'noreply@board.example',
      mailSecret: 're_a_key',
      mailSecurity: '',
    })
    expect(chosen.ok).toBe(true)
    if (chosen.ok) {
      expect(mailConfigFromInstallInput(chosen.value)).toMatchObject({
        port: 465,
        security: 'tls',
      })
    }
  })

  it('skips by default, so a form that submits no mail fields still installs', () => {
    const result = parseInstallInput(valid)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.mailPreset).toBe(MAIL_SKIP)
  })

  it('fills in what the preset knows and keeps what the operator typed', () => {
    const result = parseInstallInput({
      ...valid,
      mailPreset: 'resend-smtp',
      mailFrom: 'noreply@board.example',
      mailSecret: 're_a_key',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(mailConfigFromInstallInput(result.value)).toEqual({
      transport: 'smtp',
      from: 'noreply@board.example',
      host: 'smtp.resend.com',
      port: 465,
      security: 'tls',
      username: 'resend',
      password: 're_a_key',
    })
  })

  it('lets a typed host beat the preset, so a moved hostname is not fatal', () => {
    const result = parseInstallInput({
      ...valid,
      mailPreset: 'resend-smtp',
      mailFrom: 'noreply@board.example',
      mailHost: 'smtp2.resend.com',
      mailSecret: 're_a_key',
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(mailConfigFromInstallInput(result.value)).toMatchObject({
        host: 'smtp2.resend.com',
      })
    }
  })

  it('follows the security mode to the right port when they disagree', () => {
    const result = parseInstallInput({
      ...valid,
      mailPreset: 'resend-smtp',
      mailFrom: 'noreply@board.example',
      mailSecurity: 'starttls',
      mailSecret: 're_a_key',
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(mailConfigFromInstallInput(result.value)).toMatchObject({
        port: 587,
        security: 'starttls',
      })
    }
  })

  it('takes the endpoint from an API preset and needs only a key', () => {
    const result = parseInstallInput({
      ...valid,
      mailPreset: 'resend-http',
      mailFrom: 'noreply@board.example',
      mailSecret: 're_a_key',
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(mailConfigFromInstallInput(result.value)).toEqual({
        transport: 'http',
        from: 'noreply@board.example',
        endpoint: 'https://api.resend.com/emails',
        token: 're_a_key',
      })
    }
  })

  it.each([
    ['mailFrom', { mailPreset: 'resend-http', mailSecret: 're_key' }],
    ['mailSecret', { mailPreset: 'resend-http', mailFrom: 'noreply@board.example' }],
    ['mailHost', { mailPreset: 'smtp', mailFrom: 'noreply@board.example' }],
  ])('asks for %s when the chosen transport needs it', (field, input) => {
    const result = parseInstallInput({ ...valid, ...input })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(Object.keys(result.errors)).toContain(field)
  })

  it('asks for none of that when the operator is skipping', () => {
    expect(parseInstallInput({ ...valid, mailPreset: MAIL_SKIP }).ok).toBe(true)
  })

  it('refuses half a credential, which is always a typo', () => {
    const result = parseInstallInput({
      ...valid,
      mailPreset: 'smtp',
      mailFrom: 'noreply@board.example',
      mailHost: 'smtp.example',
      mailUsername: 'board',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(Object.keys(result.errors)).toContain('mailSecret')
  })

  it('accepts an unauthenticated relay, which is a real deployment', () => {
    const result = parseInstallInput({
      ...valid,
      mailPreset: 'smtp',
      mailFrom: 'noreply@board.example',
      mailHost: 'localhost',
      mailPort: '25',
      mailSecurity: 'none',
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(mailConfigFromInstallInput(result.value)).toMatchObject({
        host: 'localhost',
        port: 25,
        username: '',
        password: '',
      })
    }
  })

  it.each([['0'], ['70000'], ['half']])('refuses the port %s', (port) => {
    const result = parseInstallInput({
      ...valid,
      mailPreset: 'smtp',
      mailFrom: 'noreply@board.example',
      mailHost: 'smtp.example',
      mailPort: port,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(Object.keys(result.errors)).toContain('mailPort')
  })

  it('refuses a preset it does not have, rather than installing without mail', () => {
    const result = parseInstallInput({
      ...valid,
      mailPreset: 'carrier-pigeon',
      mailFrom: 'noreply@board.example',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(Object.keys(result.errors)).toContain('mailPreset')
  })
})

describe('reading the submitted form', () => {
  const formOf = (values: Record<string, string>) => ({
    get: (name: string) => values[name] ?? null,
  })

  it('reads every field the schema defines, and no others', () => {
    const seen = new Set<string>()
    installInputFromForm({
      get: (name: string) => {
        seen.add(name)
        return null
      },
    })

    expect([...seen].sort()).toEqual([...INSTALL_FIELDS].sort())
  })

  it('never echoes a secret back to the page', () => {
    expect([...SECRET_FIELDS].sort()).toEqual(['mailSecret', 'password'])
    for (const secret of SECRET_FIELDS) expect(ECHOED_FIELDS).not.toContain(secret)
    expect([...ECHOED_FIELDS, ...SECRET_FIELDS].sort()).toEqual([...INSTALL_FIELDS].sort())
  })

  it('carries the API key through to the schema', () => {
    const raw = installInputFromForm(
      formOf({
        boardName: 'The Bike Shed',
        boardUrl: 'https://board.example',
        username: 'wren',
        email: 'wren@example.test',
        password: 'a-long-enough-password',
        mailPreset: 'resend-http',
        mailFrom: 'noreply@board.example',
        mailSecret: 're_a_key',
      }),
    )

    const result = parseInstallInput(raw)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(mailConfigFromInstallInput(result.value)).toMatchObject({ token: 're_a_key' })
    }
  })

  it('reads a box that was not on the page as blank rather than as missing', () => {
    expect(installInputFromForm(formOf({})).mailPreset).toBe('')
    expect(parseInstallInput(installInputFromForm(formOf({}))).ok).toBe(false)
  })
})

describe('the answers the environment has already given', () => {
  const typed = {
    boardName: 'The Bike Shed',
    username: 'wren',
    email: 'wren@example.test',
    password: 'a-long-enough-password',
    boardUrl: '',
  }

  it('installs when APP_URL supplies the address the form did not ask for', () => {
    const raw = withEnvironmentAnswers(
      { ...typed },
      { boardUrl: 'https://board.example', mailIsFromEnvironment: false },
    )

    const result = parseInstallInput(raw)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.boardUrl).toBe('https://board.example')
  })

  it('lets the environment win, not the browser', () => {
    const raw = withEnvironmentAnswers(
      { ...typed, boardUrl: 'https://attacker.example' },
      { boardUrl: 'https://board.example', mailIsFromEnvironment: false },
    )
    expect(raw.boardUrl).toBe('https://board.example')
  })

  it('leaves the form to answer when the environment has not', () => {
    const raw = withEnvironmentAnswers(
      { ...typed, boardUrl: 'https://board.example' },
      { boardUrl: null, mailIsFromEnvironment: false },
    )
    expect(raw.boardUrl).toBe('https://board.example')
  })

  it('stores no mail settings when MAIL_DRIVER owns mail', () => {
    const raw = withEnvironmentAnswers(
      { ...typed, boardUrl: 'https://board.example', mailPreset: '', mailFrom: 'x@y.example' },
      { boardUrl: null, mailIsFromEnvironment: true },
    )

    expect(raw.mailPreset).toBe(MAIL_SKIP)
    expect(raw.mailFrom).toBe('')

    const result = parseInstallInput(raw)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(mailConfigFromInstallInput(result.value)).toEqual({ transport: 'log' })
    }
  })
})

describe('the preflight’s mail check', () => {
  const unconfigured = {
    configured: false,
    source: 'board' as const,
    summary: 'Not sending — messages are written to the server log',
  }

  it('warns, but does not block, when mail is not set up', () => {
    const checks = preflight(ready({ mail: unconfigured }))
    expect(idsOf(warnings(checks))).toContain('mail')
    expect(canProceed(checks)).toBe(true)
  })

  it('blocks when the environment claims mail and cannot deliver it', () => {
    const checks = preflight(
      ready({
        mail: {
          configured: false,
          source: 'environment',
          summary: 'HTTP API at api.resend.com, from (no address)',
        },
      }),
    )

    expect(idsOf(blockers(checks))).toContain('mail')
    expect(canProceed(checks)).toBe(false)
  })

  it('says so, without a credential, when mail is already working', () => {
    const check = preflight(ready()).find((c) => c.id === 'mail')
    expect(check?.level).toBe('ok')
    expect(check?.title).toContain('smtp.example')
  })
})

describe('the board address check', () => {
  it.each([[null], ['']])(
    'says the form supplies it when APP_URL is %o, without warning',
    (publicUrl) => {
      const checks = preflight(ready({ publicUrl }))
      const check = checks.find((c) => c.id === 'public-url')

      expect(check?.level).toBe('ok')
      expect(check?.title).toContain('form below')
      expect(idsOf(warnings(checks))).not.toContain('public-url')
    },
  )

  it('names APP_URL, and its value, when the environment supplies it', () => {
    const check = preflight(ready()).find((c) => c.id === 'public-url')
    expect(check?.title).toContain('APP_URL')
    expect(check?.title).toContain('https://board.example')
    expect(check?.title).not.toContain('PUBLIC_URL')
  })
})

describe('the tick-secret warning', () => {
  it('says which deployments it actually applies to', () => {
    const check = preflight(ready({ hasTickSecret: false })).find(
      (c) => c.id === 'tick-secret',
    )

    expect(check?.level).toBe('warning')
    expect(check?.detail).toContain('worker')
    expect(check?.detail).toContain('HTTP')
  })
})

describe('the board address', () => {
  const valid = {
    boardName: 'The Bike Shed',
    username: 'wren',
    email: 'wren@example.test',
    boardUrl: 'https://board.example',
    password: 'a-long-enough-password',
  }

  it('normalises away a trailing slash, so no link is ever double-slashed', () => {
    const result = parseInstallInput({ ...valid, boardUrl: 'https://board.example///' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.boardUrl).toBe('https://board.example')
  })

  it.each([
    ['', 'nothing at all'],
    ['board.example', 'no scheme, so nothing can be built from it'],
    ['mailto:hi@board.example', 'a URL, and not one a link can be made from'],
    ['javascript:alert(1)', 'the reason this is not z.string().url()'],
    ['https://board.example/forum', 'a page address, not the board’s'],
    ['https://board.example/?ref=x', 'a query nobody meant to keep'],
  ])('refuses %o — %s', (boardUrl) => {
    const result = parseInstallInput({ ...valid, boardUrl })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(Object.keys(result.errors)).toContain('boardUrl')
  })

  it.each([
    'https://board.example',
    'http://localhost:3000',
    'https://board.example:8443',
    'https://forum.board.example/',
  ])('accepts %o', (boardUrl) => {
    expect(parseInstallInput({ ...valid, boardUrl }).ok).toBe(true)
  })
})
