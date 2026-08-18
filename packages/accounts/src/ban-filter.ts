import { ValidationError } from '@meith/core'
import { msg } from '@meith/i18n'

import { foldIdentifier } from './case-fold'

export const BAN_FILTER_TYPES = ['username', 'email', 'ip'] as const
export type BanFilterType = (typeof BAN_FILTER_TYPES)[number]

export interface BanFilter {
  readonly id: number
  readonly type: BanFilterType
  readonly pattern: string
}

export interface BanFilterSubject {
  readonly username?: string | undefined
  readonly email?: string | undefined
  readonly ip?: string | undefined
}

export const BAN_FILTER_PATTERN_MAX = 200
export const BAN_FILTER_WILDCARD_MAX = 20

function preparedPattern(type: BanFilterType, pattern: string): string {
  return type === 'ip' ? pattern.trim() : foldIdentifier(pattern)
}

function wildcards(pattern: string): number {
  let count = 0
  for (const char of pattern) {
    if (char === '*' || char === '?') count += 1
  }
  return count
}

function tooLong(pattern: string): boolean {
  return [...pattern].length > BAN_FILTER_PATTERN_MAX
}

function tooWild(pattern: string): boolean {
  return wildcards(pattern) > BAN_FILTER_WILDCARD_MAX
}

function globMatches(pattern: string, value: string): boolean {
  const p = [...pattern]
  const v = [...value]

  let pi = 0
  let vi = 0
  let star = -1
  let resume = 0

  while (vi < v.length) {
    if (pi < p.length && (p[pi] === '?' || p[pi] === v[vi])) {
      pi += 1
      vi += 1
    } else if (pi < p.length && p[pi] === '*') {
      star = pi
      resume = vi
      pi += 1
    } else if (star !== -1) {
      resume += 1
      pi = star + 1
      vi = resume
    } else {
      return false
    }
  }

  while (pi < p.length && p[pi] === '*') pi += 1

  return pi === p.length
}

export function assertUsableFilter(type: BanFilterType, pattern: string): void {
  const trimmed = pattern.trim()

  if (trimmed === '') {
    throw new ValidationError(msg('error.accounts.ban-filter-needs-pattern'))
  }

  if (/^\*+$/.test(trimmed)) {
    throw new ValidationError(
      `"${trimmed}" would match every ${type} and lock everyone out. ` +
        'Use the registration settings to close signups instead.',
    )
  }

  if (!(BAN_FILTER_TYPES as readonly string[]).includes(type)) {
    throw new ValidationError(`Unknown ban filter type: ${type}`)
  }

  const prepared = preparedPattern(type, pattern)

  if (tooLong(prepared)) {
    throw new ValidationError(
      msg('error.accounts.ban-filter-pattern-long', { max: BAN_FILTER_PATTERN_MAX }),
    )
  }

  if (tooWild(prepared)) {
    throw new ValidationError(
      msg('error.accounts.ban-filter-too-many-wildcards', { max: BAN_FILTER_WILDCARD_MAX }),
    )
  }
}

function subjectValue(type: BanFilterType, subject: BanFilterSubject): string | undefined {
  if (type === 'username') return subject.username ? foldIdentifier(subject.username) : undefined
  if (type === 'email') return subject.email ? foldIdentifier(subject.email) : undefined
  return subject.ip?.trim()
}

export function matchBanFilter(
  filters: readonly BanFilter[],
  subject: BanFilterSubject,
): BanFilter | null {
  for (const filter of filters) {
    const value = subjectValue(filter.type, subject)
    if (value === undefined || value === '') continue

    const pattern = preparedPattern(filter.type, filter.pattern)
    if (tooLong(pattern) || tooWild(pattern)) continue
    if (globMatches(pattern, value)) return filter
  }
  return null
}
