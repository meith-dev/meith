/**
 * F83 — the preflight, and why it is a pure function over probes.
 *
 * An installer's job is not really "create some rows". It is to tell somebody
 * whose board is not working *why*, before they have a board to be confused
 * about. Nearly every failure a new operator hits is visible before anything is
 * written: no database URL, the wrong connection string, a missing secret, a
 * board that is already installed.
 *
 * So the checks are a function from a **probe** — a plain record of what the
 * environment looks like — to a list of findings. Nothing here opens a
 * connection, reads the environment directly, or touches Next; the app gathers
 * the facts and this decides what they mean. That is what makes "what does the installer
 * say when the URL is the direct one" a unit test rather than a manual
 * experiment against a real Supabase project.
 *
 * ## Blockers and warnings are different, and the distinction is the feature
 *
 * A **blocker** means installing cannot succeed. A **warning** means it will
 * succeed and something will be wrong later — which is the more dangerous
 * category, because nothing complains at the time. The pooler check is the
 * archetype: a board on the direct connection string installs perfectly, works
 * in testing, and starts refusing connections under the first real traffic, with
 * an error that names the database rather than the cause.
 */

import type { MailSource } from '@meith/settings'

export type Level = 'blocker' | 'warning' | 'ok'

/**
 * What the environment already says about mail, as the installer finds it.
 *
 * `configured` is about *shape* — a transport with everything it needs — and
 * never about whether the credentials work. Only a send proves that, and the
 * installer does send: see `install-actions`. This is what decides whether to
 * offer the operator a mail form at all.
 */
export interface MailProbe {
  /** True when a complete, non-`log` transport is already resolved. */
  readonly configured: boolean
  /**
   * `environment` means `MAIL_DRIVER` is set and the form must not offer to
   * override it — the boxes would be ignored, and a form whose values are
   * discarded is worse than no form.
   */
  readonly source: MailSource
  /** Safe to print: names a host, never a credential. */
  readonly summary: string
}

export interface Check {
  readonly id: string
  readonly level: Level
  readonly title: string
  /** What to do about it. Empty for an `ok`. */
  readonly detail: string
}

/**
 * What the app measured. Every field is a fact, never a judgement.
 *
 * `null` consistently means "not determined" rather than "no": a connection that
 * was never attempted and one that failed are different situations, and an
 * installer that conflated them would report a database problem to somebody who
 * has not configured one yet.
 */
export interface PreflightProbe {
  readonly dataSource: 'fixture' | 'postgres'
  readonly databaseUrl: string | null
  readonly hasAuthSecret: boolean
  readonly hasTickSecret: boolean
  readonly publicUrl: string | null
  /**
   * How the board would send mail *before* this form is submitted — the
   * environment's answer, or the stored settings of a board being reinstalled.
   *
   * A fact, like every other field here: it says what is configured, not whether
   * the operator ought to configure something. The judgement is below.
   */
  readonly mail: MailProbe
  /** `null` when no attempt was made — usually because there was no URL. */
  readonly canConnect: boolean | null
  /** `null` when unknown (no connection). */
  readonly pendingMigrations: number | null
  /** `null` when unknown. Any user at all means this is not a fresh board. */
  readonly userCount: number | null
  /** Whether the one-time marker is already set. */
  readonly alreadyInstalled: boolean
}

/**
 * Does this look like a pooler connection string?
 *
 * A heuristic, and it is honest about being one: the check *warns*, it does not
 * block, because a self-hosted board talking to Postgres on 5432 is entirely
 * correct and telling that operator they are wrong would train them to ignore
 * the installer.
 *
 * Three signals, any of which is enough — Supabase's pooler port, a host that
 * says so, or an explicit `pgbouncer=true`. Missing all three on a *serverless*
 * deployment is what the warning is for.
 */
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

/**
 * Read the probe and say what it means.
 *
 * Ordered as somebody would fix them: what is missing, then what is
 * unreachable, then what is already done. An installer that reported "no admin
 * account" above "no database" would be technically complete and useless.
 */
export function preflight(probe: PreflightProbe): readonly Check[] {
  const checks: Check[] = []

  /* ---- Already installed. First, because nothing else matters if so. ---- */
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
    /*
     * The second, independent gate. A run that created the administrator and
     * then failed before writing the marker must not be re-runnable — the second
     * attempt would create a *second* administrator on somebody else's board,
     * which is the one outcome an installer must make impossible.
     */
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

  /* ---- Database ---- */
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
    /*
     * Not a blocker: applying them is a *step of the install*, not a
     * prerequisite for it. Reporting the count is still worth it — an operator
     * who sees "42 migrations will be applied" understands what the button does.
     */
    checks.push({
      id: 'migrations',
      level: 'ok',
      title: `${probe.pendingMigrations} migration${probe.pendingMigrations === 1 ? '' : 's'} will be applied`,
      detail: '',
    })
  }

  /* ---- Secrets ---- */
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

  /*
   * The board's own address — and it has always been `APP_URL`, never
   * `PUBLIC_URL`.
   *
   * These two checks said `PUBLIC_URL`: a variable that appears nowhere in the
   * schema, is read by nothing, and would have done nothing had anybody set it.
   * The probe beside them has read `env.APP_URL` since the day it was written.
   * On the one screen whose entire job is telling a new operator what to fix,
   * naming the wrong variable does not merely fail to help — it sends them to
   * change something that cannot have any effect, and the link in the password
   * reset stays broken.
   *
   * It is no longer a *warning*, because the form below now asks for it and
   * requires an answer. What is left to report is which of the two places the
   * answer will come from, since one of them makes the form's box inert.
   */
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

  /* ---- Mail ---- */
  if (probe.mail.configured) {
    checks.push(ok('mail', `Mail is configured — ${probe.mail.summary}`))
  } else if (probe.mail.source === 'environment') {
    /*
     * A blocker, uniquely among the mail states, and the only one here that is
     * not about the operator's choice. `MAIL_DRIVER` is set, so the environment
     * has taken the decision away from the form below — and it is incomplete, so
     * what it took the decision away *for* cannot send. Installing would produce
     * a board whose mail screen is read-only and whose mail does not work, and
     * the fix is a variable this screen cannot write.
     */
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

/** May the install proceed? Blockers stop it; warnings never do. */
export function canProceed(checks: readonly Check[]): boolean {
  return !checks.some((check) => check.level === 'blocker')
}

export function blockers(checks: readonly Check[]): readonly Check[] {
  return checks.filter((check) => check.level === 'blocker')
}

export function warnings(checks: readonly Check[]): readonly Check[] {
  return checks.filter((check) => check.level === 'warning')
}
