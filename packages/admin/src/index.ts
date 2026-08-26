import { ForbiddenError, ValidationError } from '@meith/core'

export const ADMIN_IDLE_MINUTES = 30

export const ADMIN_MAX_HOURS = 8

export const REAUTH_MINUTES = 15

export interface AdminSessionRecord {
  readonly id: number
  readonly userId: number
  readonly ipPrefix: string | null
  readonly authenticatedAt: Date
  readonly lastSeenAt: Date
  readonly expiresAt: Date
  readonly revokedAt: Date | null
  readonly createdAt: Date
}

export interface AdminContext {
  readonly session: AdminSessionRecord
  readonly userId: number
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

  findLive(tokenHash: string, now: Date): Promise<AdminSessionRecord | null>

  touch(sessionId: number, now: Date, expiresAt: Date, windowSeconds: number): Promise<void>

  markReauthenticated(sessionId: number, at: Date): Promise<void>

  revoke(sessionId: number, at: Date): Promise<void>

  revokeAllForUser(userId: number, at: Date): Promise<void>
}

export interface AdminLogRow {
  readonly id: number
  readonly userId: number | null
  readonly username: string | null
  readonly action: string
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
    readonly offset?: number | undefined
    readonly before?: number | undefined
    readonly action?: string | undefined
  }): Promise<readonly AdminLogRow[]>

  count(input: { readonly action?: string | undefined }): Promise<number>

  actions(limit?: number): Promise<readonly string[]>
}

export function parseAllowlist(raw: string | undefined): readonly string[] {
  if (raw === undefined) return []
  return raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry !== '')
}

export function ipAllowed(remoteAddress: string | null, allowlist: readonly string[]): boolean {
  if (allowlist.length === 0) return true
  if (remoteAddress === null || remoteAddress.trim() === '') return false

  const address = remoteAddress.trim().toLowerCase()
  return allowlist.some((entry) =>
    entry.endsWith('.') || entry.endsWith(':') ? address.startsWith(entry) : address === entry,
  )
}

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

  async resolve(tokenHash: string): Promise<AdminContext | null> {
    const now = this.now()
    const session = await this.sessions.findLive(tokenHash, now)
    if (session === null) return null

    if (now.getTime() - session.createdAt.getTime() > ADMIN_MAX_HOURS * 3_600_000) {
      await this.sessions.revoke(session.id, now)
      return null
    }

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

  async markReauthenticated(sessionId: number): Promise<void> {
    await this.sessions.markReauthenticated(sessionId, this.now())
  }

  async end(sessionId: number): Promise<void> {
    await this.sessions.revoke(sessionId, this.now())
  }

  async endAllFor(userId: number): Promise<void> {
    await this.sessions.revokeAllForUser(userId, this.now())
  }

  requireFreshProof(context: AdminContext): void {
    if (context.needsReauth) {
      throw new ForbiddenError(
        'Confirm your password again before doing this. It has been more than ' +
          `${REAUTH_MINUTES} minutes since you last did.`,
      )
    }
  }
}

export function staleProof(session: AdminSessionRecord, now: Date): boolean {
  return now.getTime() - session.authenticatedAt.getTime() > REAUTH_MINUTES * 60_000
}

export function assertLogAction(action: string): void {
  if (!/^[a-z][a-z0-9]*(\.[a-z][a-z0-9_]*)+$/.test(action)) {
    throw new ValidationError(`"${action}" is not a valid admin log action.`)
  }
}
