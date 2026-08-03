import { argon2id, argon2Verify } from 'hash-wasm'

import { isLegacyHash, verifyMybbPassword } from './legacy'

/**
 * Argon2id cost parameters. One source of truth; `needsRehash` compares a
 * stored hash's embedded parameters against these, so raising a value here is
 * all it takes to transparently upgrade every password on next login (F17).
 *
 * m=19456 KiB (19 MiB), t=2, p=1 — the plan's mandated floor, matching the
 * OWASP Argon2id recommendation.
 */
export interface PasswordPolicy {
  /** Memory cost in kibibytes. */
  readonly memorySize: number
  /** Time cost (iterations). */
  readonly iterations: number
  /** Degree of parallelism. */
  readonly parallelism: number
}

export const CURRENT_PASSWORD_POLICY: PasswordPolicy = {
  memorySize: 19456,
  iterations: 2,
  parallelism: 1,
}

const SALT_BYTES = 16
const HASH_BYTES = 32

/**
 * Hash a plaintext password, returning a self-describing PHC string
 * (`$argon2id$v=19$m=...,t=...,p=...$salt$hash`). The parameters travel *with*
 * the hash so verification can never use the wrong cost.
 */
export async function hashPassword(
  password: string,
  policy: PasswordPolicy = CURRENT_PASSWORD_POLICY,
): Promise<string> {
  if (password.length === 0) {
    // An empty password must never produce a usable hash: it would make every
    // passwordless (OAuth/legacy) row verifiable with "".
    throw new Error('Refusing to hash an empty password.')
  }
  const salt = randomBytes(SALT_BYTES)
  return argon2id({
    password,
    salt,
    memorySize: policy.memorySize,
    iterations: policy.iterations,
    parallelism: policy.parallelism,
    hashLength: HASH_BYTES,
    outputType: 'encoded',
  })
}

/**
 * Constant-time verify. Returns false (never throws) on a malformed or
 * unrecognised hash so callers have exactly one boolean to branch on — a thrown
 * parse error must not read differently from a wrong password.
 */
export async function verifyPassword(
  password: string,
  encodedHash: string | null | undefined,
): Promise<boolean> {
  if (!encodedHash) return false

  /*
   * F86. A hash imported from MyBB takes the legacy verifier, dispatched on its
   * prefix rather than guessed from its shape — a bare 32-character hex string
   * is never treated as a password hash, because that is what an unprefixed
   * legacy column looks like and "verify anything of the right shape" is how an
   * unrelated field becomes a login.
   *
   * Nothing else changes: `needsRehash` already returns true for anything that
   * is not a current-policy Argon2id hash, so the caller replaces this on the
   * first successful sign-in and the row stops being a liability.
   */
  if (isLegacyHash(encodedHash)) return verifyMybbPassword(password, encodedHash)

  try {
    return await argon2Verify({ password, hash: encodedHash })
  } catch {
    return false
  }
}

/** Parsed Argon2 PHC parameters, or null when the string is not a v=19 argon2 hash. */
export interface Argon2Params {
  readonly algo: 'argon2id' | 'argon2i' | 'argon2d'
  readonly memorySize: number
  readonly iterations: number
  readonly parallelism: number
}

const PHC = /^\$(argon2id|argon2i|argon2d)\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$/

/** Parse the cost parameters out of a PHC-encoded Argon2 hash. */
export function parseArgon2Params(encodedHash: string): Argon2Params | null {
  const m = PHC.exec(encodedHash)
  if (!m) return null
  return {
    algo: m[1] as Argon2Params['algo'],
    memorySize: Number(m[2]),
    iterations: Number(m[3]),
    parallelism: Number(m[4]),
  }
}

/**
 * True when a stored hash should be replaced after a successful login: either it
 * is not a current-standard Argon2id hash (a migrated legacy hash, or argon2i/d),
 * or its cost is below the current policy. Never *weakens* — a hash stronger than
 * policy is left alone.
 */
export function needsRehash(
  encodedHash: string,
  policy: PasswordPolicy = CURRENT_PASSWORD_POLICY,
): boolean {
  const p = parseArgon2Params(encodedHash)
  if (p === null) return true
  if (p.algo !== 'argon2id') return true
  return (
    p.memorySize < policy.memorySize ||
    p.iterations < policy.iterations ||
    p.parallelism < policy.parallelism
  )
}

/** CSPRNG bytes from the Web Crypto global (Node 18+ and Edge, no node:crypto). */
function randomBytes(n: number): Uint8Array {
  const bytes = new Uint8Array(n)
  crypto.getRandomValues(bytes)
  return bytes
}
