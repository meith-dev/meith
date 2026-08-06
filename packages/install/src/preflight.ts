export type Level = 'blocker' | 'warning' | 'ok'

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
  readonly canConnect: boolean | null
  readonly pendingMigrations: number | null
  readonly userCount: number | null
  readonly alreadyInstalled: boolean
}

export function looksLikePooler(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }

  if (parsed.port === '6543') return true
  if (/pooler|pgbouncer|proxy/i.test(parsed.hostname)) return true
  if (parsed.searchParams.get('pgbouncer') === 'true') return true
  return false
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

    if (!looksLikePooler(probe.databaseUrl)) {
      checks.push({
        id: 'pooler',
        level: 'warning',
        title: 'This does not look like a pooler connection string',
        detail:
          'On a serverless platform every function instance opens its own connection, and ' +
          'Postgres runs out at around a hundred — so a board on the direct string works in ' +
          'testing and starts refusing connections under real traffic, with an error that ' +
          'names the database rather than the cause. Use the transaction-mode pooler URL. ' +
          'If you are self-hosting against your own Postgres, this warning does not apply.',
      })
    } else {
      checks.push(ok('pooler', 'The connection string looks like a pooler'))
    }
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
        'The scheduled tick is how bans expire, digests send and counters reconcile. Without ' +
        'the secret the endpoint refuses every call — and nothing fails visibly, the work ' +
        'simply never happens.',
    })
  } else {
    checks.push(ok('tick-secret', 'TICK_SECRET is set'))
  }

  if (probe.publicUrl === null || probe.publicUrl === '') {
    checks.push({
      id: 'public-url',
      level: 'warning',
      title: 'PUBLIC_URL is not set',
      detail:
        'Mail, feeds and canonical URLs need an absolute address — there is no request to be ' +
        'relative to when a digest is sent from the worker.',
    })
  } else {
    checks.push(ok('public-url', 'PUBLIC_URL is set'))
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
