import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

export const TOKEN_PREFIX = 'forum_pat'

export const FEED_TOKEN_PREFIX = 'forum_feed'

const LOOKUP_LENGTH = 8
const SECRET_BYTES = 32

export const SCOPES = [
  'forums:read',
  'threads:read',
  'threads:write',
  'posts:read',
  'posts:write',
  'members:read',
  'messages:read',
  'messages:write',
  'polls:write',
  'reputation:write',
  'subscriptions:read',
  'subscriptions:write',
  'search:read',
] as const

export type Scope = (typeof SCOPES)[number]

export function isScope(value: string): value is Scope {
  return (SCOPES as readonly string[]).includes(value)
}

export interface ApiTokenRecord {
  readonly id: number
  readonly userId: number
  readonly name: string
  readonly lookup: string
  readonly secretHash: string
  readonly scopes: readonly Scope[]
  readonly expiresAt: Date | null
  readonly revokedAt: Date | null
}

export interface IssuedToken {
  readonly token: string
  readonly lookup: string
  readonly secretHash: string
}

export interface ApiTokenRepository {
  findByLookup(lookup: string): Promise<ApiTokenRecord | null>
  touch(id: number, at: Date): Promise<void>
}

export function hashTokenSecret(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex')
}

const DECOY_HASH = hashTokenSecret('')

export function secretMatches(presentedSecret: string, storedHash: string): boolean {
  const candidate = Buffer.from(hashTokenSecret(presentedSecret), 'hex')
  const stored = Buffer.from(storedHash, 'hex')
  return candidate.length === stored.length && timingSafeEqual(candidate, stored)
}

export function issueToken(prefix: string = TOKEN_PREFIX): IssuedToken {
  const lookup = randomBytes(LOOKUP_LENGTH).toString('hex').slice(0, LOOKUP_LENGTH)
  const secret = randomBytes(SECRET_BYTES).toString('base64url')

  return {
    token: `${prefix}_${lookup}_${secret}`,
    lookup,
    secretHash: hashTokenSecret(secret),
  }
}

export interface ParsedToken {
  readonly lookup: string
  readonly secret: string
}

export function parseToken(presented: string, prefix: string = TOKEN_PREFIX): ParsedToken | null {
  const marker = `${prefix}_`
  if (!presented.startsWith(marker)) return null

  const rest = presented.slice(marker.length)
  const separator = rest.indexOf('_')
  if (separator === -1) return null

  const lookup = rest.slice(0, separator)
  const secret = rest.slice(separator + 1)
  if (lookup.length !== LOOKUP_LENGTH || secret.length < 20) return null

  return { lookup, secret }
}

export type TokenFailure = 'malformed' | 'unknown' | 'revoked' | 'expired' | 'bad-secret'

export type TokenOutcome =
  | { readonly ok: true; readonly token: ApiTokenRecord }
  | { readonly ok: false; readonly reason: TokenFailure }

export async function authenticateToken(
  presented: string,
  repository: ApiTokenRepository,
  now: Date,
): Promise<TokenOutcome> {
  const parsed = parseToken(presented)
  if (parsed === null) return { ok: false, reason: 'malformed' }

  const record = await repository.findByLookup(parsed.lookup)
  if (record === null) return { ok: false, reason: 'unknown' }

  if (!secretMatches(parsed.secret, record.secretHash)) {
    return { ok: false, reason: 'bad-secret' }
  }

  if (record.revokedAt !== null) return { ok: false, reason: 'revoked' }
  if (record.expiresAt !== null && record.expiresAt.getTime() <= now.getTime()) {
    return { ok: false, reason: 'expired' }
  }

  return { ok: true, token: record }
}

export interface FeedTokenRecord {
  readonly id: number
  readonly userId: number
  readonly lookup: string
  readonly secretHash: string
}

export interface FeedTokenRepository {
  findByLookup(lookup: string): Promise<FeedTokenRecord | null>
}

export type FeedTokenOutcome =
  | { readonly ok: true; readonly record: FeedTokenRecord }
  | { readonly ok: false }

export async function authenticateFeedToken(
  presented: string,
  repository: FeedTokenRepository,
): Promise<FeedTokenOutcome> {
  const parsed = parseToken(presented, FEED_TOKEN_PREFIX)
  if (parsed === null) return { ok: false }

  const record = await repository.findByLookup(parsed.lookup)
  if (record === null) {
    secretMatches(parsed.secret, DECOY_HASH)
    return { ok: false }
  }

  if (!secretMatches(parsed.secret, record.secretHash)) return { ok: false }

  return { ok: true, record }
}

export function hasScope(token: ApiTokenRecord, scope: Scope): boolean {
  return token.scopes.includes(scope)
}

export function bearerFrom(header: string | null): string | null {
  if (header === null) return null
  const match = /^bearer\s+(\S+)$/i.exec(header.trim())
  return match?.[1] ?? null
}
