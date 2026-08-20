import { describe, expect, it } from 'vitest'

import {
  bundleName,
  contentTypeFor,
  formatBytes,
  parseManifest,
  resolveUploadsMode,
} from './backup'

describe('resolveUploadsMode', () => {
  it('includes local uploads unless told otherwise', () => {
    expect(resolveUploadsMode('local', undefined)).toBe('include')
    expect(resolveUploadsMode('local', 'skip')).toBe('skip')
  })

  it('leaves the S3 bucket alone unless told otherwise', () => {
    expect(resolveUploadsMode('s3', undefined)).toBe('skip')
    expect(resolveUploadsMode('s3', 'include')).toBe('include')
  })

  it('names the flag on a value it does not know', () => {
    expect(() => resolveUploadsMode('local', 'sometimes')).toThrow(/--uploads/)
  })
})

describe('bundleName', () => {
  it('stamps the moment without characters a filesystem rejects', () => {
    const name = bundleName(new Date('2026-08-20T14:03:07.123Z'))
    expect(name).toBe('meith-backup-2026-08-20T14-03-07Z.tar.gz')
    expect(name).not.toContain(':')
  })
})

describe('parseManifest', () => {
  const manifest = {
    format: 1,
    createdAt: '2026-08-20T14:03:07.123Z',
    version: '0.12.0',
    filestore: 'local',
    uploads: 'included',
  }

  it('round-trips a manifest the backup wrote', () => {
    expect(parseManifest(JSON.stringify(manifest))).toEqual(manifest)
  })

  it('keeps the bucket when one is recorded', () => {
    const withBucket = { ...manifest, filestore: 's3', uploads: 'skipped', bucket: 'board' }
    expect(parseManifest(JSON.stringify(withBucket)).bucket).toBe('board')
  })

  it('refuses a format this build does not restore', () => {
    expect(() => parseManifest(JSON.stringify({ ...manifest, format: 2 }))).toThrow(/format 2/)
  })

  it('refuses a bundle that is not a bundle', () => {
    expect(() => parseManifest('not json')).toThrow(/manifest/)
    expect(() => parseManifest(JSON.stringify({ format: 1 }))).toThrow(/uploads/)
  })
})

describe('contentTypeFor', () => {
  it('names image types by extension and falls back to bytes', () => {
    expect(contentTypeFor('avatars/ab/deadbeef.png')).toBe('image/png')
    expect(contentTypeFor('a/b.JPG')).toBe('image/jpeg')
    expect(contentTypeFor('a/b.dump')).toBe('application/octet-stream')
  })
})

describe('formatBytes', () => {
  it('scales to the readable unit', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 KiB')
    expect(formatBytes(52428800)).toBe('50 MiB')
  })
})
