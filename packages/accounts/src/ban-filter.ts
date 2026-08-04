/**
 * Ban filters (F23) — glob patterns matched against a username, email or IP.
 *
 * Pure and database-free, because this is the code that decides whether someone
 * may create an account at all, and every branch of it should be exercisable
 * without a fixture.
 *
 * Patterns are admin-authored (`*@spam.example`, `192.0.2.*`) and are *not*
 * regular expressions. That is deliberate: F37 makes the same call about custom
 * BBCode, for the same reason — accepting regex from an ACP form hands whoever
 * has that screen a denial-of-service at minimum, via a pattern that
 * backtracks catastrophically.
 */
import { ValidationError } from '@meith/core'

import { foldIdentifier } from './case-fold'

export const BAN_FILTER_TYPES = ['username', 'email', 'ip'] as const
export type BanFilterType = (typeof BAN_FILTER_TYPES)[number]

export interface BanFilter {
  readonly id: number
  readonly type: BanFilterType
  /** Glob: `*` matches any run of characters, `?` exactly one. */
  readonly pattern: string
}

/** What a registration or login attempt is checked against. */
export interface BanFilterSubject {
  readonly username?: string | undefined
  readonly email?: string | undefined
  readonly ip?: string | undefined
}

/**
 * Compile a glob to an anchored regular expression.
 *
 * Every character that is not a wildcard is escaped, so a pattern containing
 * `.` or `(` matches those literally rather than acting as a regex — an
 * unescaped `.` in `*@spam.example` would also match `*@spamXexample`, which
 * silently widens a ban beyond what the admin typed.
 *
 * Anchored at both ends: an unanchored pattern would make `spam` match
 * `notspam@example.com`, banning people the admin never intended.
 */
function compile(pattern: string): RegExp {
  const source = [...pattern]
    .map((char) => {
      if (char === '*') return '.*'
      if (char === '?') return '.'
      return char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    })
    .join('')

  return new RegExp(`^${source}$`)
}

/** Reject a pattern that would ban everyone, before it reaches the database. */
export function assertUsableFilter(type: BanFilterType, pattern: string): void {
  const trimmed = pattern.trim()

  if (trimmed === '') {
    throw new ValidationError('A ban filter needs a pattern.')
  }

  /*
   * `*` alone matches every value of its type, which locks the entire board out
   * of registration or login — including the administrator who typed it. An
   * admin who genuinely wants to close registration has a setting for that.
   */
  if (/^\*+$/.test(trimmed)) {
    throw new ValidationError(
      `"${trimmed}" would match every ${type} and lock everyone out. ` +
        'Use the registration settings to close signups instead.',
    )
  }

  if (!(BAN_FILTER_TYPES as readonly string[]).includes(type)) {
    throw new ValidationError(`Unknown ban filter type: ${type}`)
  }
}

/** The value a filter of this type is tested against, already folded. */
function subjectValue(type: BanFilterType, subject: BanFilterSubject): string | undefined {
  if (type === 'username') return subject.username ? foldIdentifier(subject.username) : undefined
  if (type === 'email') return subject.email ? foldIdentifier(subject.email) : undefined
  // IPs are compared literally: they have no case, and folding a v6 address
  // would be a no-op that only obscures what is happening.
  return subject.ip?.trim()
}

/**
 * The first filter that matches, or null.
 *
 * Returns the filter rather than a boolean so the caller can log *which* rule
 * fired — a ban with no attributable rule is unauditable, and the first
 * question after a false positive is always "which pattern did this?".
 */
export function matchBanFilter(
  filters: readonly BanFilter[],
  subject: BanFilterSubject,
): BanFilter | null {
  for (const filter of filters) {
    const value = subjectValue(filter.type, subject)
    if (value === undefined || value === '') continue

    const pattern = filter.type === 'ip' ? filter.pattern.trim() : foldIdentifier(filter.pattern)
    if (compile(pattern).test(value)) return filter
  }
  return null
}
