import { generateToken, hashToken } from './crypto/tokens'
import type { RequestContext } from './service'
import type { AccountStore, Clock } from './ports'

export interface SessionServiceDeps {
  readonly store: AccountStore
  readonly rememberDays: number
  readonly sessionLifetimeDays: number
  readonly clock?: Clock
}

export interface RememberedLogin {
  readonly userId: number
  readonly sessionToken: string
  readonly sessionExpiresAt: Date
  readonly rememberToken: string
  readonly rememberExpiresAt: Date
}

export type ResumeOutcome =
  | { readonly status: 'ok'; readonly login: RememberedLogin }
  | { readonly status: 'reuse'; readonly userId: number }
  | { readonly status: 'invalid' }

const DAY_MS = 86_400_000

export class SessionService {
  private readonly store: AccountStore
  private readonly rememberDays: number
  private readonly sessionLifetimeDays: number
  private readonly now: Clock

  constructor(deps: SessionServiceDeps) {
    this.store = deps.store
    this.rememberDays = deps.rememberDays
    this.sessionLifetimeDays = deps.sessionLifetimeDays
    this.now = deps.clock ?? (() => new Date())
  }

  async start(
    userId: number,
    context: RequestContext = {},
  ): Promise<{ token: string; expiresAt: Date }> {
    return this.mintSession(userId, this.now(), context)
  }

  async startRemembered(
    userId: number,
    context: RequestContext = {},
  ): Promise<RememberedLogin> {
    const at = this.now()
    const familyId = generateToken()
    const rememberToken = generateToken()
    const rememberExpiresAt = new Date(at.getTime() + this.rememberDays * DAY_MS)
    await this.store.remember.issue({
      tokenHash: await hashToken(rememberToken),
      familyId,
      userId,
      expiresAt: rememberExpiresAt,
    })
    const session = await this.mintSession(userId, at, context)
    return {
      userId,
      sessionToken: session.token,
      sessionExpiresAt: session.expiresAt,
      rememberToken,
      rememberExpiresAt,
    }
  }

  async resume(
    rememberToken: string,
    context: RequestContext = {},
  ): Promise<ResumeOutcome> {
    const at = this.now()
    const nextToken = generateToken()
    const rotation = await this.store.remember.rotate({
      presentedHash: await hashToken(rememberToken),
      nextHash: await hashToken(nextToken),
      now: at,
      nextExpiresAt: new Date(at.getTime() + this.rememberDays * DAY_MS),
    })

    if (rotation.status === 'invalid') return { status: 'invalid' }

    if (rotation.status === 'reuse') {
      await this.store.remember.revokeFamily(rotation.familyId, 'token_reuse', at)
      await this.store.sessions.revokeAllForUser(rotation.userId)
      return { status: 'reuse', userId: rotation.userId }
    }

    const session = await this.mintSession(rotation.userId, at, context)
    return {
      status: 'ok',
      login: {
        userId: rotation.userId,
        sessionToken: session.token,
        sessionExpiresAt: session.expiresAt,
        rememberToken: nextToken,
        rememberExpiresAt: new Date(at.getTime() + this.rememberDays * DAY_MS),
      },
    }
  }

  private async mintSession(
    userId: number,
    at: Date,
    context: RequestContext = {},
  ): Promise<{ token: string; expiresAt: Date }> {
    const token = generateToken()
    const expiresAt = new Date(at.getTime() + this.sessionLifetimeDays * DAY_MS)
    await this.store.sessions.create({
      tokenHash: await hashToken(token),
      userId,
      expiresAt,
      ipPrefix: context.ipPrefix ?? null,
      userAgent: context.userAgent ?? null,
    })
    return { token, expiresAt }
  }
}
