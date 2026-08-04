/**
 * `@meith/admin` — F63.
 *
 * The control panel's own front door: a second session, an optional address
 * allowlist, a re-authentication clock, and the shape of an audit row.
 *
 * Everything here is about one idea. **The ACP is not "the board, but for
 * administrators".** It is a separate surface with its own session, its own
 * timeout and its own proof of identity, because the threat it defends against
 * is not an attacker guessing a password — it is an administrator's own browser
 * being used by somebody else, or their board session being stolen.
 *
 * A domain package in the R2 sense: interfaces in, no SQL, no Next. It does not
 * know what a group is either — whether somebody may reach the ACP at all is
 * `admincp.access`, resolved by `@meith/authorization` and handed here as a
 * boolean (F20).
 */
import { ForbiddenError, ValidationError } from '@meith/core'

/**
 * How long an ACP session survives without activity.
 *
 * Thirty minutes, which would be unusable for the board and is exactly right
 * here: expiring it signs somebody out of `/admin` and nothing else, so the
 * cost of being wrong is one password entry rather than a lost draft.
 */
export const ADMIN_IDLE_MINUTES = 30

/**
 * The absolute ceiling, activity or not.
 *
 * An idle timeout alone can be defeated by a page that polls. Eight hours is a
 * working day: an administrator who started before breakfast re-authenticates
 * after lunch, and a session left running over a weekend is simply gone.
 */
export const ADMIN_MAX_HOURS = 8

/**
 * How recently the password must have been proved for a destructive operation.
 *
 * Fifteen minutes, measured from `authenticatedAt` — a clock that **activity
 * does not move**. That separation is the whole mechanism: browsing the ACP for
 * an hour keeps the session alive and does *not* keep the proof fresh, so
 * "delete every post by this member" asks again even though nothing expired.
 */
export const REAUTH_MINUTES = 15

export interface AdminSessionRecord {
  readonly id: number
  readonly userId: number
  readonly ipPrefix: string | null
  /** Moved only by re-entering the password. */
  readonly authenticatedAt: Date
  readonly lastSeenAt: Date
  readonly expiresAt: Date
  readonly revokedAt: Date | null
  readonly createdAt: Date
}

/** A live ACP session plus what the screens need to know about it. */
export interface AdminContext {
  readonly session: AdminSessionRecord
  readonly userId: number
  /** True when a destructive operation would ask for the password again. */
  readonly needsReauth: boolean
}

export interface AdminSessionRepository {
  create(input: {
    readonly userId: number
    readonly tokenHash: string
    readonly ipPrefix: string | null
    readonly expiresAt: Date
    readonly at: Date
  }): Promise<AdminSessionRecord>

  /** The live session behind a token hash, or null. Expiry is the query's job. */
  findLive(tokenHash: string, now: Date): Promise<AdminSessionRecord | null>

  /** Extend a live session, at most once per `windowSeconds`. */
  touch(sessionId: number, now: Date, expiresAt: Date, windowSeconds: number): Promise<void>

  /** Move the *proof* clock. Called only after a password is re-entered. */
  markReauthenticated(sessionId: number, at: Date): Promise<void>

  revoke(sessionId: number, at: Date): Promise<void>

  /** Every ACP session for one member — used when their password changes. */
  revokeAllForUser(userId: number, at: Date): Promise<void>
}

/** One row of the admin log, as the screen shows it. */
export interface AdminLogRow {
  readonly id: number
  readonly userId: number | null
  readonly username: string | null
  readonly action: string
  /** Arbitrary JSON captured by whoever logged it. Rendered as text. */
  readonly detail: Readonly<Record<string, unknown>>
  readonly ipPrefix: string | null
  readonly createdAt: Date
}

export interface AdminLogRepository {
  record(input: {
    readonly userId: number | null
    readonly action: string
    readonly detail: Readonly<Record<string, unknown>>
    readonly ipPrefix: string | null
    readonly at: Date
  }): Promise<void>

  list(input: {
    readonly limit: number
    readonly before?: number | undefined
    readonly action?: string | undefined
  }): Promise<readonly AdminLogRow[]>

  /**
   * The distinct action names present, for the filter control.
   *
   * Read from the data rather than from a list of known actions: the log
   * carries rows written by every feature and by plugins (F69), so a
   * hard-coded list would be missing exactly the row somebody is hunting for.
   */
  actions(limit?: number): Promise<readonly string[]>
}

/* ------------------------------------------------------------------ *
 * The address allowlist
 * ------------------------------------------------------------------ */

/**
 * Parse the allowlist as configured.
 *
 * Comma-separated, and each entry is either a whole address or a **prefix
 * ending in a dot or colon** (`203.0.113.` or `2001:db8:`). Deliberately not
 * CIDR: a mask is a thing operators get wrong by one bit, silently, and the
 * failure mode is locking yourself out of your own board. A textual prefix is
 * something you can read back and be sure about.
 */
export function parseAllowlist(raw: string | undefined): readonly string[] {
  if (raw === undefined) return []
  return raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry !== '')
}

/**
 * Is this address allowed in?
 *
 * **An empty allowlist allows everything.** The feature is optional by
 * acceptance, and the alternative — empty means nothing is allowed — turns
 * "forgot to configure it" into a board nobody can administer.
 *
 * A *missing* address with a non-empty allowlist is **refused**. That is the
 * one case where failing closed matters: if the deployment cannot tell us where
 * a request came from, an allowlist cannot do its job, and quietly ignoring it
 * would make the whole feature theatre.
 */
export function ipAllowed(
  remoteAddress: string | null,
  allowlist: readonly string[],
): boolean {
  if (allowlist.length === 0) return true
  if (remoteAddress === null || remoteAddress.trim() === '') return false

  const address = remoteAddress.trim().toLowerCase()
  return allowlist.some((entry) =>
    entry.endsWith('.') || entry.endsWith(':')
      ? address.startsWith(entry)
      : address === entry,
  )
}

/* ------------------------------------------------------------------ *
 * The service
 * ------------------------------------------------------------------ */

export interface AdminServiceDeps {
  readonly sessions: AdminSessionRepository
  readonly now?: () => Date
}

export class AdminService {
  private readonly sessions: AdminSessionRepository
  private readonly now: () => Date

  constructor(deps: AdminServiceDeps) {
    this.sessions = deps.sessions
    this.now = deps.now ?? (() => new Date())
  }

  /**
   * Open an ACP session.
   *
   * The caller has already checked `admincp.access` **and** re-verified the
   * password. Both are the app's job: this package knows nothing about groups
   * or about how a password is stored.
   */
  async start(input: {
    readonly userId: number
    readonly tokenHash: string
    readonly ipPrefix: string | null
  }): Promise<AdminSessionRecord> {
    const at = this.now()
    return this.sessions.create({
      userId: input.userId,
      tokenHash: input.tokenHash,
      ipPrefix: input.ipPrefix,
      expiresAt: new Date(at.getTime() + ADMIN_IDLE_MINUTES * 60_000),
      at,
    })
  }

  /**
   * Resolve a live session from a token hash, extending it.
   *
   * Returns null for anything that is not live — expired, revoked, unknown, or
   * past the absolute ceiling. The caller cannot tell those apart, and should
   * not: every one of them means "sign in again".
   */
  async resolve(tokenHash: string): Promise<AdminContext | null> {
    const now = this.now()
    const session = await this.sessions.findLive(tokenHash, now)
    if (session === null) return null

    /*
     * The absolute ceiling, checked here rather than in the query: it is a
     * property of when the session *started*, and folding it into the expiry
     * column would mean recomputing that column on every touch and getting the
     * two clocks confused.
     */
    if (now.getTime() - session.createdAt.getTime() > ADMIN_MAX_HOURS * 3_600_000) {
      await this.sessions.revoke(session.id, now)
      return null
    }

    /* Throttled inside the repository, like every other touch on this board. */
    await this.sessions.touch(
      session.id,
      now,
      new Date(now.getTime() + ADMIN_IDLE_MINUTES * 60_000),
      60,
    )

    return {
      session,
      userId: session.userId,
      needsReauth: staleProof(session, now),
    }
  }

  /** Record that the password has just been proved again. */
  async markReauthenticated(sessionId: number): Promise<void> {
    await this.sessions.markReauthenticated(sessionId, this.now())
  }

  async end(sessionId: number): Promise<void> {
    await this.sessions.revoke(sessionId, this.now())
  }

  async endAllFor(userId: number): Promise<void> {
    await this.sessions.revokeAllForUser(userId, this.now())
  }

  /**
   * Refuse a destructive operation whose proof has gone stale.
   *
   * A throw rather than a boolean, because every caller's correct response is
   * the same and a boolean is a thing somebody forgets to check.
   */
  requireFreshProof(context: AdminContext): void {
    if (context.needsReauth) {
      throw new ForbiddenError(
        'Confirm your password again before doing this. It has been more than ' +
          `${REAUTH_MINUTES} minutes since you last did.`,
      )
    }
  }
}

/** True when the password proof is older than the re-auth window. */
export function staleProof(session: AdminSessionRecord, now: Date): boolean {
  return now.getTime() - session.authenticatedAt.getTime() > REAUTH_MINUTES * 60_000
}

/**
 * Refuse an action name that is not a sensible log key.
 *
 * The log is read by grouping on `action`, so a free-text value with a member's
 * name in it makes the column useless. Lowercase dotted segments, like the
 * rows F48–F53 already write (`thread.merge`, `warning.issue`).
 */
export function assertLogAction(action: string): void {
  if (!/^[a-z][a-z0-9]*(\.[a-z][a-z0-9_]*)+$/.test(action)) {
    throw new ValidationError(`"${action}" is not a valid admin log action.`)
  }
}
