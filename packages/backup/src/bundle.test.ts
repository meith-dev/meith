import { describe, expect, it } from 'vitest'

import {
  bundleName,
  contentTypeFor,
  formatBytes,
  parseManifest,
  resolveUploadsMode,
  skippedKeyLines,
} from './bundle'

describe('resolveUploadsMode', () => {
  it('includes local uploads unless told otherwise', () => {
    expect(resolveUploadsMode('local', undefined)).toBe('include')
    expect(resolveUploadsMode('local', 'skip')).toBe('skip')
  })

  it('leaves the S3 bucket alone unless told otherwise', () => {
    expect(resolveUploadsMode('s3', undefined)).toBe('skip')
    expect(resolveUploadsMode('s3', 'auto')).toBe('skip')
    expect(resolveUploadsMode('s3', 'include')).toBe('include')
  })

  it('carries the Blob store unless told otherwise, because nothing else will', () => {
    expect(resolveUploadsMode('blob', undefined)).toBe('include')
  })

  it('names the flag on a value it does not know', () => {
    expect(() => resolveUploadsMode('local', 'maybe')).toThrow('--uploads')
  })
})

describe('bundleName', () => {
  it('stamps the moment without characters a filesystem rejects', () => {
    expect(bundleName(new Date('2026-09-01T02:00:00.123Z'))).toBe(
      'meith-backup-2026-09-01T02-00-00Z.tar.gz',
    )
  })
})

describe('parseManifest', () => {
  const manifest = {
    format: 1,
    createdAt: '2026-09-01T02:00:00.000Z',
    version: '0.33.4',
    filestore: 'local',
    uploads: 'included',
  }

  it('round-trips a manifest the backup wrote', () => {
    expect(parseManifest(JSON.stringify(manifest))).toEqual(manifest)
  })

  it('keeps the bucket and the skipped keys when recorded', () => {
    expect(
      parseManifest(
        JSON.stringify({ ...manifest, filestore: 's3', bucket: 'b', skippedKeys: ['a/b'] }),
      ),
    ).toMatchObject({ bucket: 'b', skippedKeys: ['a/b'] })
    expect(parseManifest(JSON.stringify({ ...manifest, skippedKeys: [] }))).not.toHaveProperty(
      'skippedKeys',
    )
  })

  it('refuses what it cannot restore', () => {
    expect(() => parseManifest(JSON.stringify({ ...manifest, format: 2 }))).toThrow('format 2')
    expect(() => parseManifest(JSON.stringify({ ...manifest, filestore: 'ftp' }))).toThrow(
      'file driver',
    )
    expect(() => parseManifest(JSON.stringify({ ...manifest, uploads: 'maybe' }))).toThrow(
      'uploads',
    )
    expect(() => parseManifest(JSON.stringify({ ...manifest, skippedKeys: [1] }))).toThrow(
      'skipped objects',
    )
    expect(() => parseManifest('nope')).toThrow('valid JSON')
  })
})

describe('skippedKeyLines', () => {
  it('escapes what it prints and stops listing at ten', () => {
    expect(skippedKeyLines(['a\u0001b'])).toEqual(['  "a\\u0001b"'])
    const many = Array.from({ length: 12 }, (_, index) => `key-${index}`)
    const lines = skippedKeyLines(many)
    expect(lines).toHaveLength(11)
    expect(lines[10]).toContain('2 more')
  })
})

describe('contentTypeFor and formatBytes', () => {
  it('names image types by extension and falls back to bytes', () => {
    expect(contentTypeFor('avatars/a.PNG')).toBe('image/png')
    expect(contentTypeFor('attachments/x/source')).toBe('application/octet-stream')
  })

  it('scales to the readable unit', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1.5 KiB')
    expect(formatBytes(10 * 1024 * 1024)).toBe('10 MiB')
  })
})
