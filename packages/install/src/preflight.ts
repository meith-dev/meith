import type { MailSource } from '@meith/settings'

export type Level = 'blocker' | 'warning' | 'ok'

export interface MailProbe {
  readonly configured: boolean
  readonly source: MailSource
  readonly summary: string
}

export interface Check {
  readonly id: string
  readonly level: Level
  readonly title: string
  readonly detail: string
}

export interface PreflightProbe {
  readonly dataSource: 'fixture' | 'postgres'
  readonly databaseUrl: string | null
  readonly hasAuthSecret: boolean
  readonly hasTickSecret: boolean
  readonly publicUrl: string | null
  readonly mail: MailProbe
  readonly canConnect: boolean | null
  readonly pendingMigrations: number | null
  readonly userCount: number | null
  readonly alreadyInstalled: boolean
}

function ok(id: string, title: string): Check {
  return { id, level: 'ok', title, detail: '' }
}

export function preflight(probe: PreflightProbe): readonly Check[] {
  const checks: Check[] = []

  if (probe.alreadyInstalled) {
    checks.push({
      id: 'already-installed',
      level: 'blocker',
      title: 'This board is already installed',
      detail:
        'The installer disabled itself when it finished, and it cannot be run again. ' +
        'Use /admin to configure the board, or the operator CLI if you have lost access.',
    })
  } else if (probe.userCount !== null && probe.userCount > 0) {
    checks.push({
      id: 'has-members',
      level: 'blocker',
      title: 'This board already has accounts',
      detail:
        `There ${probe.userCount === 1 ? 'is 1 account' : `are ${probe.userCount} accounts`} in ` +
        'the database, so this is not a fresh board. Installing again would add a second ' +
        'administrator to a board that already has members.',
    })
  } else {
    checks.push(ok('fresh', 'This board has not been installed yet'))
  }

  if (probe.dataSource !== 'postgres') {
    checks.push({
      id: 'data-source',
      level: 'blocker',
      title: 'The board is running on in-memory sample data',
      detail:
        'Set DATABASE_URL (and DATA_SOURCE=postgres) and redeploy. Nothing installed into ' +
        'the fixture store would survive the next request, let alone the next deployment.',
    })
  } else if (probe.databaseUrl === null || probe.databaseUrl === '') {
    checks.push({
      id: 'database-url',
      level: 'blocker',
      title: 'DATABASE_URL is not set',
      detail: 'Add it to the project environment and redeploy.',
    })
  } else {
    checks.push(ok('database-url', 'DATABASE_URL is set'))
  }

  if (probe.canConnect === false) {
    checks.push({
      id: 'connect',
      level: 'blocker',
      title: 'The database refused the connection',
      detail:
        'Check the host, the password and whether the database allows connections from this ' +
        'deployment. The board cannot install what it cannot reach.',
    })
  } else if (probe.canConnect === true) {
    checks.push(ok('connect', 'The database accepted a connection'))
  }

  if (probe.pendingMigrations !== null && probe.pendingMigrations > 0) {
    checks.push({
      id: 'migrations',
      level: 'ok',
      title: `${probe.pendingMigrations} migration${probe.pendingMigrations === 1 ? '' : 's'} will be applied`,
      detail: '',
    })
  }

  if (!probe.hasAuthSecret) {
    checks.push({
      id: 'auth-secret',
      level: 'blocker',
      title: 'AUTH_SECRET is not set',
      detail:
        'Sessions and tokens are signed with it and there is no default, deliberately: a ' +
        'shipped default is a board anybody who has read the source can sign a session for.',
    })
  } else {
    checks.push(ok('auth-secret', 'AUTH_SECRET is set'))
  }

  if (!probe.hasTickSecret) {
    checks.push({
      id: 'tick-secret',
      level: 'warning',
      title: 'TICK_SECRET is not set',
      detail:
        'The scheduled tick is how bans expire, digests send and counters reconcile. ' +
        'Whether that matters here depends on what drives it: a deployment with a worker ' +
        'process runs the tick in-process and never calls the endpoint, so the work happens ' +
        'either way — this is the compose stack the handbook documents. A deployment that ' +
        'drives the tick over HTTP needs the secret, because without it the endpoint ' +
        'refuses every call and nothing fails visibly; the work simply never happens.',
    })
  } else {
    checks.push(ok('tick-secret', 'TICK_SECRET is set'))
  }

  if (probe.publicUrl !== null && probe.publicUrl !== '') {
    checks.push(
      ok(
        'public-url',
        `The board's address comes from APP_URL — ${probe.publicUrl}`,
      ),
    )
  } else {
    checks.push({
      id: 'public-url',
      level: 'ok',
      title: 'The form below sets the board’s address',
      detail:
        'Mail, feeds and canonical URLs need an absolute address — there is no request to ' +
        'be relative to when a digest is sent from the worker. The box is filled in from ' +
        'the address you are reading this at; check it before installing, because every ' +
        'link the board ever sends is built from what you confirm.',
    })
  }

  if (probe.mail.configured) {
    checks.push(ok('mail', `Mail is configured — ${probe.mail.summary}`))
  } else if (probe.mail.source === 'environment') {
    checks.push({
      id: 'mail',
      level: 'blocker',
      title: 'MAIL_DRIVER is set but incomplete',
      detail:
        `The environment says ${probe.mail.summary}, which overrides anything this ` +
        'installer or the settings screen could store — and it is missing something it ' +
        'needs. Complete it in the environment and redeploy, or unset MAIL_DRIVER and ' +
        'configure mail on the form below.',
    })
  } else {
    checks.push({
      id: 'mail',
      level: 'warning',
      title: 'Mail is not configured yet',
      detail:
        'The form below can set it up, and this is the moment to do it. Installing without ' +
        'mail is supported and leaves a board people can still join — new accounts work ' +
        'immediately by default rather than waiting for a confirmation nothing would send. ' +
        'What does not work is the forgotten-password form, for every member and for you. ' +
        'Mail can also be configured later, from the settings screen, without a redeploy.',
    })
  }

  return checks
}

export function canProceed(checks: readonly Check[]): boolean {
  return !checks.some((check) => check.level === 'blocker')
}

export function blockers(checks: readonly Check[]): readonly Check[] {
  return checks.filter((check) => check.level === 'blocker')
}

export function warnings(checks: readonly Check[]): readonly Check[] {
  return checks.filter((check) => check.level === 'warning')
}
