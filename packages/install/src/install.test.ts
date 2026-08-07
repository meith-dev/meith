import { describe, expect, it } from 'vitest'

import {
  INSTALL_STEPS,
  blockers,
  canProceed,
  defaultForumSlug,
  firstFailure,
  freshReport,
  installed,
  looksLikePooler,
  MAIL_SKIP,
  mailConfigFromInstallInput,
  parseInstallInput,
  preflight,
  warnings,
  type PreflightProbe,
} from './index'

/** A board that is ready to install: everything set, nothing done yet. */
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

  /*
   * Not a blocker: applying them is a *step of the install* rather than a
   * prerequisite. Reported anyway, because "23 migrations will be applied" is
   * what makes the button's effect legible.
   */
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

  /* An attempt that was never made is not a failure. */
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

  /*
   * **The second, independent gate.** A run that created the administrator and
   * then failed before writing the marker must not be re-runnable: the second
   * attempt would add a second administrator to somebody else's board, which is
   * the one outcome an installer has to make impossible.
   */
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

  /* An unknown count must not gate: a board with no tables yet cannot be counted. */
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
  /*
   * The archetype. A board on the direct string installs perfectly, works in
   * testing, and starts refusing connections under the first real traffic, with
   * an error that names the database rather than the cause. It warns rather than
   * blocks because a self-hosted board on 5432 is entirely correct — and telling
   * that operator they are wrong trains them to ignore the installer.
   */
  it('warns about a connection string that is not a pooler', () => {
    const checks = preflight(
      ready({ databaseUrl: 'postgresql://user:pw@db.example.com:5432/forum' }),
    )
    expect(idsOf(warnings(checks))).toContain('pooler')
    expect(canProceed(checks)).toBe(true)
  })

  it.each([
    'postgresql://u:p@aws-0-eu-west-1.pooler.supabase.com:6543/postgres',
    'postgresql://u:p@db.example.com:6543/forum',
    'postgresql://u:p@pgbouncer.internal:5432/forum',
    'postgresql://u:p@db.example.com:5432/forum?pgbouncer=true',
  ])('recognises %o as a pooler', (url) => {
    expect(looksLikePooler(url)).toBe(true)
  })

  it.each([
    'postgresql://u:p@db.example.com:5432/forum',
    'postgresql://u:p@localhost/forum',
    'not a url at all',
    '',
  ])('does not claim %o is a pooler', (url) => {
    expect(looksLikePooler(url)).toBe(false)
  })

  it('warns about a missing TICK_SECRET without blocking', () => {
    const checks = preflight(ready({ hasTickSecret: false }))
    expect(idsOf(warnings(checks))).toContain('tick-secret')
    expect(canProceed(checks)).toBe(true)
  })

  it.each([null, ''])('warns about an APP_URL of %o', (publicUrl) => {
    expect(idsOf(warnings(preflight(ready({ publicUrl }))))).toContain('public-url')
  })

  it('never lets a warning stop the install', () => {
    const checks = preflight(
      ready({
        databaseUrl: 'postgresql://u:p@db.example.com:5432/forum',
        hasTickSecret: false,
        publicUrl: null,
      }),
    )
    expect(warnings(checks)).toHaveLength(3)
    expect(canProceed(checks)).toBe(true)
  })
})

describe('the step plan', () => {
  it('ends by disabling the installer', () => {
    /*
     * Last, and the ordering is the argument. Written first, a failure halfway
     * through leaves a board that is "installed", has no administrator, and
     * cannot be installed again — unrecoverable without SQL.
     */
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

    /* A short report is not a complete one, however green its entries are. */
    expect(installed(done.slice(0, -1))).toBe(false)
  })

  /*
   * The *first* failure, not all of them. The steps are sequential, so a later
   * step that never ran is not a second problem — and three failures caused by
   * one is how an error screen stops being read.
   */
  it('reports the first failure only', () => {
    const report = [
      { id: 'migrate', status: 'done' as const },
      { id: 'settings', status: 'failed' as const, error: 'first' },
      { id: 'admin', status: 'failed' as const, error: 'second' },
    ]
    expect(firstFailure(report)?.error).toBe('first')
    expect(firstFailure(freshReport())).toBeNull()
  })
})

describe('the form', () => {
  const valid = {
    boardName: 'The Bike Shed',
    username: 'wren',
    email: 'wren@example.test',
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

  /*
   * Twelve characters, and only for this account: it is the one credential that
   * can reconfigure the board, it is chosen before any lockout exists to protect
   * it, and its owner is in a hurry — which is when "password1" gets typed.
   */
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

  /* A board named only in a non-Latin script slugs to nothing. */
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

/**
 * Mail at install time.
 *
 * The reason it is on this screen at all is that it is the only piece of
 * configuration that is *harder* to add later than now — not technically, but
 * because a board with no mail works, looks finished, and stays that way until
 * the first member forgets their password. These are the rules that make asking
 * for it survivable on a form with no scripting.
 */
describe('the mail half of the form', () => {
  const valid = {
    boardName: 'The Bike Shed',
    username: 'wren',
    email: 'wren@example.test',
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
    /*
     * The one mail field that is an enum rather than free text, so an empty box
     * is a value *outside* it rather than a permissive default. Without the
     * preprocess, a board being installed with no mail at all could not be
     * submitted without first picking a TLS mode for the transport it does not
     * have — every browser submits the blank option as `''`.
     */
    expect(parseInstallInput({ ...valid, mailPreset: MAIL_SKIP, mailSecurity: '' }).ok).toBe(
      true,
    )

    const chosen = parseInstallInput({
      ...valid,
      mailPreset: 'resend-smtp',
      mailFrom: 'noreply@board.example',
      mailPassword: 're_a_key',
      mailSecurity: '',
    })
    expect(chosen.ok).toBe(true)
    if (chosen.ok) {
      /* Falls through to the preset's pairing rather than to the enum default. */
      expect(mailConfigFromInstallInput(chosen.value)).toMatchObject({
        port: 465,
        security: 'tls',
      })
    }
  })

  it('skips by default, so a form that submits no mail fields still installs', () => {
    /*
     * The default has to be "skip" rather than "" — an unselected select submits
     * nothing, and a missing value that fell through to a transport would refuse
     * a form the operator filled in correctly.
     */
    const result = parseInstallInput(valid)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.mailPreset).toBe(MAIL_SKIP)
  })

  it('fills in what the preset knows and keeps what the operator typed', () => {
    const result = parseInstallInput({
      ...valid,
      mailPreset: 'resend-smtp',
      mailFrom: 'noreply@board.example',
      mailPassword: 're_a_key',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    /* Host, port, security and the mandated username all come from the preset. */
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
    /*
     * The presets are static data and will age. A board must not become
     * un-installable because a provider moved a hostname between releases.
     */
    const result = parseInstallInput({
      ...valid,
      mailPreset: 'resend-smtp',
      mailFrom: 'noreply@board.example',
      mailHost: 'smtp2.resend.com',
      mailPassword: 're_a_key',
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(mailConfigFromInstallInput(result.value)).toMatchObject({
        host: 'smtp2.resend.com',
      })
    }
  })

  it('follows the security mode to the right port when they disagree', () => {
    /*
     * Somebody who picks a preset carrying 465 and then selects STARTTLS means
     * 587. Handing them 465 produces the connection that hangs rather than
     * failing, which is the exact confusion the three-way mode exists to prevent.
     */
    const result = parseInstallInput({
      ...valid,
      mailPreset: 'resend-smtp',
      mailFrom: 'noreply@board.example',
      mailSecurity: 'starttls',
      mailPassword: 're_a_key',
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
      mailToken: 're_a_key',
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
    ['mailFrom', { mailPreset: 'resend-http', mailToken: 're_key' }],
    ['mailToken', { mailPreset: 'resend-http', mailFrom: 'noreply@board.example' }],
    ['mailHost', { mailPreset: 'smtp', mailFrom: 'noreply@board.example' }],
  ])('asks for %s when the chosen transport needs it', (field, input) => {
    const result = parseInstallInput({ ...valid, ...input })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(Object.keys(result.errors)).toContain(field)
  })

  it('asks for none of that when the operator is skipping', () => {
    /*
     * The whole reason the requirements are conditional. Without scripting every
     * box is on the page at once, and making them individually required would
     * demand an API endpoint from somebody who is not configuring one.
     */
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
    if (!result.ok) expect(Object.keys(result.errors)).toContain('mailPassword')
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
    /*
     * A tampered or stale form field. Falling through to "skip" would install a
     * mailless board while the operator believed they had configured one.
     */
    const result = parseInstallInput({
      ...valid,
      mailPreset: 'carrier-pigeon',
      mailFrom: 'noreply@board.example',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(Object.keys(result.errors)).toContain('mailPreset')
  })
})

/**
 * The mail check on the preflight.
 *
 * Three states, and only one of them stops the install. The distinction is the
 * feature: a board with no mail is a supported thing to install, and a board
 * whose *environment* half-configures mail is not — because the environment
 * overrides the form below, so the operator would be installing a board whose
 * mail screen is read-only and whose mail does not work.
 */
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

/**
 * The variable the installer used to name, which does not exist.
 *
 * Two checks said `PUBLIC_URL`; the probe beside them has read `APP_URL` since
 * the day it was written, and nothing anywhere reads `PUBLIC_URL`. On the one
 * screen whose job is telling a new operator what to fix, that did not merely
 * fail to help — it sent them to set something that can have no effect, and the
 * link in the password reset stayed broken.
 */
describe('the public URL check names the variable that exists', () => {
  it.each([[null], ['']])('warns about APP_URL when it is %o', (publicUrl) => {
    const check = preflight(ready({ publicUrl })).find((c) => c.id === 'public-url')
    expect(check?.title).toContain('APP_URL')
    expect(check?.title).not.toContain('PUBLIC_URL')
  })

  it('confirms APP_URL by name when it is set', () => {
    const check = preflight(ready()).find((c) => c.id === 'public-url')
    expect(check?.title).toBe('APP_URL is set')
  })
})
