import path from 'node:path'

import { ValidationError } from '@meith/core'

export type FilestoreDriver = 'local' | 's3' | 'blob'

export type UploadsMode = 'include' | 'skip'

export interface BackupManifest {
  readonly format: 1
  readonly createdAt: string
  readonly version: string
  readonly filestore: FilestoreDriver
  readonly uploads: 'included' | 'skipped'
  readonly bucket?: string
  readonly skippedKeys?: readonly string[]
}

export const BUNDLE_NAME_PATTERN =
  /^meith-backup-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})Z\.tar\.gz$/

export function isBundleName(name: string): boolean {
  return BUNDLE_NAME_PATTERN.test(name)
}

export function bundleName(at: Date): string {
  const stamp = at
    .toISOString()
    .replace(/\.\d+Z$/, 'Z')
    .replaceAll(':', '-')
  return `meith-backup-${stamp}.tar.gz`
}

export function bundleTakenAt(name: string): Date | null {
  const match = BUNDLE_NAME_PATTERN.exec(name)
  if (match === null) return null
  const at = new Date(`${match[1]}T${match[2]}:${match[3]}:${match[4]}Z`)
  return Number.isNaN(at.getTime()) ? null : at
}

export function resolveUploadsMode(driver: FilestoreDriver, flag: string | undefined): UploadsMode {
  if (flag === undefined || flag === 'auto') return driver === 's3' ? 'skip' : 'include'
  if (flag === 'include' || flag === 'skip') return flag
  throw new ValidationError(`--uploads must be "include" or "skip", got "${flag}".`)
}

export function parseManifest(raw: string): BackupManifest {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new ValidationError('The bundle manifest is not valid JSON.')
  }

  const manifest = parsed as Partial<BackupManifest>
  if (manifest.format !== 1) {
    throw new ValidationError(
      `This bundle declares format ${JSON.stringify(manifest.format)}; this build restores format 1.`,
    )
  }
  if (manifest.uploads !== 'included' && manifest.uploads !== 'skipped') {
    throw new ValidationError('The bundle manifest does not say whether uploads are included.')
  }
  if (typeof manifest.createdAt !== 'string' || typeof manifest.version !== 'string') {
    throw new ValidationError('The bundle manifest is missing createdAt or version.')
  }
  if (
    manifest.filestore !== 'local' &&
    manifest.filestore !== 's3' &&
    manifest.filestore !== 'blob'
  ) {
    throw new ValidationError('The bundle manifest does not name a known file driver.')
  }

  const skippedKeys = manifest.skippedKeys
  if (
    skippedKeys !== undefined &&
    (!Array.isArray(skippedKeys) || skippedKeys.some((key) => typeof key !== 'string'))
  ) {
    throw new ValidationError('The bundle manifest lists skipped objects in a form it cannot read.')
  }

  return {
    format: 1,
    createdAt: manifest.createdAt,
    version: manifest.version,
    filestore: manifest.filestore,
    uploads: manifest.uploads,
    ...(typeof manifest.bucket === 'string' ? { bucket: manifest.bucket } : {}),
    ...(skippedKeys === undefined || skippedKeys.length === 0 ? {} : { skippedKeys }),
  }
}

const CONTENT_TYPES: ReadonlyMap<string, string> = new Map([
  ['.avif', 'image/avif'],
  ['.gif', 'image/gif'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
])

export function contentTypeFor(key: string): string {
  return CONTENT_TYPES.get(path.extname(key).toLowerCase()) ?? 'application/octet-stream'
}

export function formatBytes(size: number): string {
  let value = size
  let unit = 'B'
  for (const next of ['KiB', 'MiB', 'GiB', 'TiB']) {
    if (value < 1024) break
    value /= 1024
    unit = next
  }
  return unit === 'B' ? `${value} B` : `${value.toFixed(value >= 10 ? 0 : 1)} ${unit}`
}

const SKIPPED_KEYS_LISTED = 10

export function skippedKeyLines(keys: readonly string[]): readonly string[] {
  const shown = keys.slice(0, SKIPPED_KEYS_LISTED)
  return [
    ...shown.map((key) => `  ${JSON.stringify(key)}`),
    ...(keys.length > shown.length
      ? [`  …and ${keys.length - shown.length} more, listed in the bundle's manifest.json.`]
      : []),
  ]
}
