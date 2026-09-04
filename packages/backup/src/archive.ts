import path from 'node:path'

import { ValidationError } from '@meith/core'

import { run } from './postgres-client'

export interface RestoreLimits {
  readonly archiveBytes: number
  readonly members: number
  readonly memberBytes: number
  readonly expandedBytes: number
}

const RESTORE_LIMIT_DEFAULTS: RestoreLimits = {
  archiveBytes: 2 * 1024 * 1024 * 1024,
  members: 100_000,
  memberBytes: 1024 * 1024 * 1024,
  expandedBytes: 8 * 1024 * 1024 * 1024,
}

function positiveInteger(value: string | undefined, variable: string, fallback: number): number {
  if (value === undefined || value === '') return fallback
  if (!/^\d+$/.test(value)) {
    throw new ValidationError(`${variable} must be a positive integer number of bytes or members.`)
  }
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new ValidationError(`${variable} must be a positive integer number of bytes or members.`)
  }
  return parsed
}

export function restoreLimits(
  environment: Readonly<Record<string, string | undefined>>,
): RestoreLimits {
  return {
    archiveBytes: positiveInteger(
      environment.MEITH_RESTORE_MAX_ARCHIVE_BYTES,
      'MEITH_RESTORE_MAX_ARCHIVE_BYTES',
      RESTORE_LIMIT_DEFAULTS.archiveBytes,
    ),
    members: positiveInteger(
      environment.MEITH_RESTORE_MAX_MEMBERS,
      'MEITH_RESTORE_MAX_MEMBERS',
      RESTORE_LIMIT_DEFAULTS.members,
    ),
    memberBytes: positiveInteger(
      environment.MEITH_RESTORE_MAX_MEMBER_BYTES,
      'MEITH_RESTORE_MAX_MEMBER_BYTES',
      RESTORE_LIMIT_DEFAULTS.memberBytes,
    ),
    expandedBytes: positiveInteger(
      environment.MEITH_RESTORE_MAX_EXPANDED_BYTES,
      'MEITH_RESTORE_MAX_EXPANDED_BYTES',
      RESTORE_LIMIT_DEFAULTS.expandedBytes,
    ),
  }
}

export interface ArchiveMember {
  readonly name: string
  readonly type: string
  readonly size: number
}

function normalizedArchiveName(name: string): string | undefined {
  if (name === '' || name.includes('\\') || name.includes('\0')) return undefined
  const withoutDirectoryMarker = name.endsWith('/') ? name.slice(0, -1) : name
  if (withoutDirectoryMarker === '.') return '.'
  const normalized = withoutDirectoryMarker.replace(/^\.\//, '')
  if (normalized === '' || path.posix.isAbsolute(normalized)) return undefined
  const parts = normalized.split('/')
  if (parts.some((part) => part === '' || part === '.' || part === '..')) return undefined
  return normalized
}

function memberSize(fields: readonly string[]): number {
  return Number(fields[1]?.includes('/') ? fields[2] : fields[4])
}

export function validateArchiveListing(
  namesOutput: string,
  verboseOutput: string,
  limits: RestoreLimits,
  allowedTypes: ReadonlySet<string>,
): readonly ArchiveMember[] {
  const names = namesOutput === '' ? [] : namesOutput.replace(/\n$/, '').split('\n')
  const verbose = verboseOutput === '' ? [] : verboseOutput.replace(/\n$/, '').split('\n')
  if (names.length !== verbose.length) {
    throw new ValidationError('The archive has malformed member names.')
  }
  if (names.length > limits.members) {
    throw new ValidationError(`The archive has more than ${limits.members} members.`)
  }

  const seen = new Set<string>()
  let expandedBytes = 0
  return names.map((rawName, index) => {
    const name = normalizedArchiveName(rawName)
    if (name === undefined || seen.has(name)) {
      throw new ValidationError(`The archive contains an unsafe or duplicate member: ${rawName}`)
    }
    seen.add(name)

    const fields = verbose[index]?.trim().split(/\s+/) ?? []
    const type = fields[0]?.[0] ?? ''
    const size = memberSize(fields)
    if (!allowedTypes.has(type) || !Number.isSafeInteger(size) || size < 0) {
      throw new ValidationError(`The archive contains an unsupported member: ${name}`)
    }
    if (size > limits.memberBytes) {
      throw new ValidationError(`The archive member ${name} exceeds the per-member size limit.`)
    }
    expandedBytes += size
    if (!Number.isSafeInteger(expandedBytes) || expandedBytes > limits.expandedBytes) {
      throw new ValidationError('The archive exceeds the expanded-size limit.')
    }
    return { name, type, size }
  })
}

export async function inspectArchive(
  archive: string,
  limits: RestoreLimits,
  allowedTypes: ReadonlySet<string>,
): Promise<readonly ArchiveMember[]> {
  const [names, verbose] = await Promise.all([
    run('tar', ['tzf', archive]),
    run('tar', ['tvzf', archive]),
  ])
  return validateArchiveListing(names, verbose, limits, allowedTypes)
}
