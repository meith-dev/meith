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

    const pattern = filter.type === 'ip' ? filter.pattern.trim() : foldIdentifier(filter.pattern)
    if (compile(pattern).test(value)) return filter
  }
  return null
}
