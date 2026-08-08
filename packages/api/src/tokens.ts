/**
 * F81 — API tokens: what they are, and what they are not.
 *
 * ## A token is not a login
 *
 * The tempting design is "authenticate with your password and get a session".
 * It is wrong here for the same reason the ACP mints its own session rather than
 * reusing the board's (F63): the two have different threat models and different
 * lifetimes. A board session is a browser cookie that lasts days and carries
 * everything the member can do. An API token is a string in somebody's CI
 * configuration, a cron job, or a chat bot — it lives for months, it gets
 * committed to repositories by accident, and it should be able to do exactly one
 * thing.
 *
 * So a token is **scoped**, **revocable individually**, and **never grants more
 * than its owner has**. The last one is the load-bearing property: a token is a
 * restriction on an actor, never a grant to one. Every request resolves the
 * owner's `Actor` and asks the Authorizer, exactly as a page does, and the scope
 * check happens *as well* — never instead.
 *
 * ## Shape: prefix, secret, hash
 *
 * `community_pat_<prefix>_<secret>`. Three parts, each earning its place:
 *
 *  - a **fixed prefix** so a leaked token is greppable. Secret scanners key on
 *    exactly this, and a board whose tokens look like random base64 will have
 *    them sitting in public repositories forever;
 *  - a short **lookup prefix**, stored in the clear and indexed, because the
 *    secret is hashed and you cannot index a hash you have to compare in
 *    constant time. Without it, authenticating one request means hashing the
 *    candidate against every token on the board;
 *  - the **secret**, stored only as a SHA-256 hash.
 *
 * SHA-256 rather than Argon2id, deliberately, and the reasoning is the opposite
 * of F17's. A password is low-entropy and chosen by a human, so it needs a slow
 * hash to survive an offline attack. A token is 32 bytes from a CSPRNG: there is
 * no dictionary and no offline attack worth the name, and a slow hash would put
 * ~100ms of Argon2 on every API request — which for an API is the difference
 * between usable and not.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/** The greppable marker. Changing it breaks every secret scanner rule. */
export const TOKEN_PREFIX = 'community_pat'

const LOOKUP_LENGTH = 8
const SECRET_BYTES = 32

/**
 * What a token may do.
 *
 * Read and write are separated per resource rather than offered as one
 * `read`/`write` pair, because the common case for a token is genuinely narrow —
 * a bot that posts, a dashboard that reads — and a scope list that forces
 * "everything readable" on a poster is a scope list nobody thinks about twice.
 *
 * `admin:read` is here and there is deliberately no `admin:write`. Anything that
 * reconfigures a board should require somebody at a keyboard with the ACP's
 * re-authentication in front of them (F63); a token that could change settings
 * is a token that can lock the owner out of their own board from a leaked CI
 * log.
 */
export const SCOPES = [
  'communities:read',
  'threads:read',
  'threads:write',
  'posts:read',
  'posts:write',
  'members:read',
  'search:read',
  'admin:read',
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
  /** Shown once, at creation. The board cannot recover it afterwards. */
  readonly token: string
  readonly lookup: string
  readonly secretHash: string
}

export interface ApiTokenRepository {
  findByLookup(lookup: string): Promise<ApiTokenRecord | null>
  /** Bumped on use, throttled in the `where` clause like every other touch. */
  touch(id: number, at: Date): Promise<void>
}

/** Hash a token secret. See the file header for why this is not Argon2id. */
export function hashTokenSecret(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex')
}

/**
 * Mint a token. The plaintext is returned once and never stored.
 */
export function issueToken(): IssuedToken {
  const lookup = randomBytes(LOOKUP_LENGTH).toString('hex').slice(0, LOOKUP_LENGTH)
  const secret = randomBytes(SECRET_BYTES).toString('base64url')

  return {
    token: `${TOKEN_PREFIX}_${lookup}_${secret}`,
    lookup,
    secretHash: hashTokenSecret(secret),
  }
}

export interface ParsedToken {
  readonly lookup: string
  readonly secret: string
}

/**
 * Split a presented token, or `null`.
 *
 * Refuses anything that is not exactly the three-part shape. A lenient parser
 * here would let a truncated token match a prefix and then fail the hash
 * comparison, which is the same outcome by a longer route — but it would also
 * let `community_pat__` look up the empty prefix, and an empty lookup that matched a
 * row would be an authentication bypass. Length is checked, not assumed.
 */
export function parseToken(presented: string): ParsedToken | null {
  /*
   * Split at the **first** underscore after the prefix, not on every one.
   *
   * The first version used `split('_')` and required four parts, which is wrong
   * in a way a test found rather than a reader: the secret is base64url, whose
   * alphabet includes `_`, so roughly every token containing one failed to parse
   * and came back as "malformed" — an intermittent authentication failure
   * depending on which bytes the CSPRNG produced. Exactly the bug that would
   * have looked like a flaky client.
   *
   * Fixing the parser rather than the alphabet, because the alphabet is not the
   * problem: a delimiter that assumes anything about what follows it is.
   */
  const marker = `${TOKEN_PREFIX}_`
  if (!presented.startsWith(marker)) return null

  const rest = presented.slice(marker.length)
  const separator = rest.indexOf('_')
  if (separator === -1) return null

  const lookup = rest.slice(0, separator)
  const secret = rest.slice(separator + 1)
  if (lookup.length !== LOOKUP_LENGTH || secret.length < 20) return null

  return { lookup, secret }
}

export type TokenFailure =
  | 'malformed'
  | 'unknown'
  | 'revoked'
  | 'expired'
  | 'bad-secret'

export type TokenOutcome =
  | { readonly ok: true; readonly token: ApiTokenRecord }
  | { readonly ok: false; readonly reason: TokenFailure }

/**
 * Authenticate a presented token against the store.
 *
 * The comparison is constant-time. It matters less than it does for a password —
 * the candidate has already been narrowed to one row by the lookup prefix — but
 * a byte-by-byte `===` on a secret is the kind of thing that is free to get
 * right and embarrassing to explain.
 *
 * Every failure returns a *reason*, and the caller is expected to answer all of
 * them with the same 401. The reasons exist for the board's own logs: "expired"
 * and "unknown" are very different operational situations and an operator who
 * cannot tell them apart cannot help anybody.
 */
export async function authenticateToken(
  presented: string,
  repository: ApiTokenRepository,
  now: Date,
): Promise<TokenOutcome> {
  const parsed = parseToken(presented)
  if (parsed === null) return { ok: false, reason: 'malformed' }

  const record = await repository.findByLookup(parsed.lookup)
  if (record === null) return { ok: false, reason: 'unknown' }

  const candidate = Buffer.from(hashTokenSecret(parsed.secret), 'hex')
  const stored = Buffer.from(record.secretHash, 'hex')
  if (candidate.length !== stored.length || !timingSafeEqual(candidate, stored)) {
    return { ok: false, reason: 'bad-secret' }
  }

  /*
   * Revocation and expiry are checked *after* the secret, on purpose. Answering
   * "revoked" to a wrong secret would confirm that a lookup prefix names a real
   * token, which is a slow enumeration of the board's token list.
   */
  if (record.revokedAt !== null) return { ok: false, reason: 'revoked' }
  if (record.expiresAt !== null && record.expiresAt.getTime() <= now.getTime()) {
    return { ok: false, reason: 'expired' }
  }

  return { ok: true, token: record }
}

/** Does this token carry the scope an endpoint requires? */
export function hasScope(token: ApiTokenRecord, scope: Scope): boolean {
  return token.scopes.includes(scope)
}

/**
 * Read a bearer token out of an `Authorization` header.
 *
 * Case-insensitive on the scheme, because RFC 7235 says so and because a client
 * sending `bearer` lower-case is a support ticket nobody should have to file.
 */
export function bearerFrom(header: string | null): string | null {
  if (header === null) return null
  const match = /^bearer\s+(\S+)$/i.exec(header.trim())
  return match?.[1] ?? null
}
