import { sha256 } from 'hash-wasm'

/**
 * Opaque credential tokens: session tokens, remember-me tokens, password-reset
 * and email-verification tokens (F17/F19).
 *
 * The plaintext token is 256 bits of CSPRNG output shown to the client exactly
 * once; only its SHA-256 digest is stored. SHA-256 (not Argon2) is deliberate:
 * the token is already un-guessable, so a slow KDF adds latency without adding
 * security, and lookup is an indexed equality on the digest rather than an
 * attacker-timable comparison of the secret.
 */

const TOKEN_BYTES = 32 // 256 bits

/** Generate a new opaque token as lowercase hex (64 chars for 256 bits). */
export function generateToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES)
  crypto.getRandomValues(bytes)
  return toHex(bytes)
}

/**
 * Digest a token for storage or lookup. Async because hash-wasm's SHA-256 is
 * WebAssembly; callers await it once per request on the auth path.
 */
export async function hashToken(token: string): Promise<string> {
  return sha256(token)
}

/**
 * Constant-time string comparison, for the rare in-memory comparison of two
 * digests (e.g. remember-me reuse detection) where the compared value is not a
 * DB index lookup. Length is not secret; content is.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

function toHex(bytes: Uint8Array): string {
  let out = ''
  for (const b of bytes) out += b.toString(16).padStart(2, '0')
  return out
}
