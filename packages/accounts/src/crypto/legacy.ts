/**
 * F86 — verifying a password against a hash this board did not create.
 *
 * ## Why a board carries somebody else's hashes at all
 *
 * The alternative is forcing every member through a password reset on migration
 * day, which is the single largest source of attrition in a forum migration:
 * the people who do not read the e-mail simply stop being members. Carrying the
 * old hash and upgrading it on the next successful sign-in costs one comparison
 * and loses nobody.
 *
 * The plaintext is never in the export, so this is the *only* way to do it.
 *
 * ## MyBB's scheme
 *
 * `md5(md5(salt) . md5(password))` — two rounds of MD5 with a per-user salt.
 * It is not a password hash by any modern standard: MD5 is fast, so an attacker
 * with the table can try billions of candidates a second, and the salt only
 * stops one rainbow table serving every account.
 *
 * That is precisely why these hashes are **transitional**. `needsRehash`
 * already returns true for anything that is not a current-policy Argon2id hash,
 * so a legacy hash is replaced on the first successful login and the row stops
 * being a liability. A board that never upgrades one has a member who has not
 * signed in since the migration — and their hash is no worse than it was on the
 * old board.
 *
 * ## What this deliberately does not do
 *
 * It does not accept a bare MD5. The stored form is prefixed `mybb$` by the
 * importer, so a plain 32-character hex string is never treated as a password
 * hash — which matters, because that is what an unprefixed legacy column looks
 * like and "verify anything that is the right shape" is how an unrelated hex
 * field becomes a login.
 */

import { createHash, timingSafeEqual } from 'node:crypto'

/** The prefix F85's importer writes: `mybb$<salt>$<hash>`. */
export const MYBB_PREFIX = 'mybb$'

export interface LegacyMybbHash {
  readonly salt: string
  readonly hash: string
}

function md5(value: string): string {
  return createHash('md5').update(value, 'utf8').digest('hex')
}

/**
 * Split a stored legacy hash, or `null`.
 *
 * Strict about the shape. A malformed row must read as "not a legacy hash"
 * rather than as an empty salt — MyBB's algorithm with an empty salt is a
 * *valid* hash of every password under a known constant, so an accepting parser
 * would turn one corrupt row into an account anybody can log into.
 */
export function parseMybbHash(stored: string): LegacyMybbHash | null {
  if (!stored.startsWith(MYBB_PREFIX)) return null

  const rest = stored.slice(MYBB_PREFIX.length)
  const separator = rest.indexOf('$')
  if (separator === -1) return null

  const salt = rest.slice(0, separator)
  const hash = rest.slice(separator + 1)

  if (salt.length === 0) return null
  if (!/^[0-9a-f]{32}$/i.test(hash)) return null

  return { salt, hash }
}

/** Is this a hash from the old board? Used to decide which verifier to run. */
export function isLegacyHash(stored: string | null | undefined): boolean {
  return typeof stored === 'string' && stored.startsWith(MYBB_PREFIX)
}

/**
 * Verify a password against MyBB's scheme.
 *
 * Constant-time on the comparison. It matters less than for a modern hash —
 * both sides are fixed-length hex the attacker can compute — but a byte-by-byte
 * `===` on a credential comparison is free to get right and awkward to justify
 * afterwards.
 *
 * Case-insensitive on the stored hex, because MyBB installations differ on
 * whether PHP wrote it upper or lower case and a migration that failed for half
 * a board because of letter case would be very hard to diagnose from "incorrect
 * password".
 */
export function verifyMybbPassword(password: string, stored: string): boolean {
  const parsed = parseMybbHash(stored)
  if (parsed === null) return false

  const computed = md5(md5(parsed.salt) + md5(password))
  const expected = Buffer.from(parsed.hash.toLowerCase(), 'utf8')
  const actual = Buffer.from(computed, 'utf8')

  if (expected.length !== actual.length) return false
  return timingSafeEqual(expected, actual)
}
