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
  readonly titleKey: string
  readonly titleArgs?: Readonly<Record<string, string | number>> | undefined
  readonly detailKey?: string | undefined
  readonly detailArgs?: Readonly<Record<string, string | number>> | undefined
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

function ok(
  id: string,
  titleKey: string,
  titleArgs?: Readonly<Record<string, string | number>>,
): Check {
  return { id, level: 'ok', titleKey, ...(titleArgs === undefined ? {} : { titleArgs }) }
}

export function preflight(probe: PreflightProbe): readonly Check[] {
  const checks: Check[] = []

  if (probe.alreadyInstalled) {
    checks.push({
      id: 'already-installed',
      level: 'blocker',
      titleKey: 'installPreflight.alreadyInstalled.title',
      detailKey: 'installPreflight.alreadyInstalled.detail',
    })
  } else if (probe.userCount !== null && probe.userCount > 0) {
    checks.push({
      id: 'has-members',
      level: 'blocker',
      titleKey: 'installPreflight.hasMembers.title',
      detailKey: 'installPreflight.hasMembers.detail',
      detailArgs: { count: probe.userCount },
    })
  } else {
    checks.push(ok('fresh', 'installPreflight.fresh.title'))
  }

  if (probe.dataSource !== 'postgres') {
    checks.push({
      id: 'data-source',
      level: 'blocker',
      titleKey: 'installPreflight.dataSource.title',
      detailKey: 'installPreflight.dataSource.detail',
    })
  } else if (probe.databaseUrl === null || probe.databaseUrl === '') {
    checks.push({
      id: 'database-url',
      level: 'blocker',
      titleKey: 'installPreflight.databaseUrl.missingTitle',
      detailKey: 'installPreflight.databaseUrl.missingDetail',
    })
  } else {
    checks.push(ok('database-url', 'installPreflight.databaseUrl.setTitle'))
  }

  if (probe.canConnect === false) {
    checks.push({
      id: 'connect',
      level: 'blocker',
      titleKey: 'installPreflight.connect.refusedTitle',
      detailKey: 'installPreflight.connect.refusedDetail',
    })
  } else if (probe.canConnect === true) {
    checks.push(ok('connect', 'installPreflight.connect.acceptedTitle'))
  }

  if (probe.pendingMigrations !== null && probe.pendingMigrations > 0) {
    checks.push({
      id: 'migrations',
      level: 'ok',
      titleKey: 'installPreflight.migrations.title',
      titleArgs: { count: probe.pendingMigrations },
    })
  }

  if (!probe.hasAuthSecret) {
    checks.push({
      id: 'auth-secret',
      level: 'blocker',
      titleKey: 'installPreflight.authSecret.missingTitle',
      detailKey: 'installPreflight.authSecret.missingDetail',
    })
  } else {
    checks.push(ok('auth-secret', 'installPreflight.authSecret.setTitle'))
  }

  if (!probe.hasTickSecret) {
    checks.push({
      id: 'tick-secret',
      level: 'warning',
      titleKey: 'installPreflight.tickSecret.missingTitle',
      detailKey: 'installPreflight.tickSecret.missingDetail',
    })
  } else {
    checks.push(ok('tick-secret', 'installPreflight.tickSecret.setTitle'))
  }

  if (probe.publicUrl !== null && probe.publicUrl !== '') {
    checks.push(ok('public-url', 'installPreflight.publicUrl.setTitle', { url: probe.publicUrl }))
  } else {
    checks.push({
      id: 'public-url',
      level: 'ok',
      titleKey: 'installPreflight.publicUrl.formTitle',
      detailKey: 'installPreflight.publicUrl.formDetail',
    })
  }

  if (probe.mail.configured) {
    checks.push(
      ok('mail', 'installPreflight.mail.configuredTitle', { summary: probe.mail.summary }),
    )
  } else if (probe.mail.source === 'environment') {
    checks.push({
      id: 'mail',
      level: 'blocker',
      titleKey: 'installPreflight.mail.incompleteTitle',
      detailKey: 'installPreflight.mail.incompleteDetail',
      detailArgs: { summary: probe.mail.summary },
    })
  } else {
    checks.push({
      id: 'mail',
      level: 'warning',
      titleKey: 'installPreflight.mail.unconfiguredTitle',
      detailKey: 'installPreflight.mail.unconfiguredDetail',
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
