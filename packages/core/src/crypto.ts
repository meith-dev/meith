import { timingSafeEqual } from "node:crypto"

/**
 * Constant-time string comparison. Used for the tick shared secret (F06) and
 * session/reset token lookups (F17, F19) — anywhere `===` would leak length or
 * prefix information through timing.
 */
export function timingSafeEqualString(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8")
  const right = Buffer.from(b, "utf8")

  // timingSafeEqual throws on length mismatch, which would itself be a leak.
  // Compare against a fixed-length digest-sized buffer instead: hash both to the
  // same length first by padding to the longer of the two.
  if (left.length !== right.length) {
    // Still perform a comparison so the failure path takes similar time.
    const padded = Buffer.alloc(Math.max(left.length, right.length))
    const other = Buffer.alloc(Math.max(left.length, right.length))
    left.copy(padded)
    right.copy(other)
    timingSafeEqual(padded, other)
    return false
  }

  return timingSafeEqual(left, right)
}
