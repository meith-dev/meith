import { describe, expect, it } from 'vitest'

import { bundleName, bundleTakenAt, isBundleName } from './bundle'
import { pruneCandidates, resolveKeep, retentionCandidates } from './retention'

const BUNDLES = [
  'meith-backup-2026-08-30T02-00-00Z.tar.gz',
  'meith-backup-2026-08-31T02-00-00Z.tar.gz',
  'meith-backup-2026-09-01T02-00-00Z.tar.gz',
] as const

describe('isBundleName', () => {
  it('accepts what bundleName writes and nothing looser', () => {
    expect(isBundleName(bundleName(new Date('2026-09-01T02:00:00.123Z')))).toBe(true)
    expect(isBundleName('meith-backup-2026-09-01T02:00:00Z.tar.gz')).toBe(false)
    expect(isBundleName('board.tar.gz')).toBe(false)
    expect(isBundleName('../meith-backup-2026-09-01T02-00-00Z.tar.gz')).toBe(false)
  })

  it('reads the moment back out of the name', () => {
    expect(bundleTakenAt(BUNDLES[0])).toEqual(new Date('2026-08-30T02:00:00Z'))
    expect(bundleTakenAt('board.tar.gz')).toBeNull()
  })
})

describe('pruneCandidates', () => {
  it('keeps the newest bundles and names the rest, oldest included', () => {
    expect(pruneCandidates([...BUNDLES].reverse(), 2)).toEqual([BUNDLES[0]])
    expect(pruneCandidates(BUNDLES, 1)).toEqual([BUNDLES[1], BUNDLES[0]])
    expect(pruneCandidates(BUNDLES, 3)).toEqual([])
  })

  it('never selects a file that is not a bundle', () => {
    expect(pruneCandidates(['notes.txt', 'board.tar.gz', ...BUNDLES], 1)).toEqual([
      BUNDLES[1],
      BUNDLES[0],
    ])
  })
})

describe('retentionCandidates', () => {
  const NOW = new Date('2026-09-01T12:00:00Z')

  it('prunes by age as well as by count, and never the newest bundle', () => {
    expect(retentionCandidates(BUNDLES, { keep: 10, keepDays: 1 }, NOW)).toEqual([
      BUNDLES[1],
      BUNDLES[0],
    ])
    expect(retentionCandidates(BUNDLES, { keep: 10, keepDays: 2 }, NOW)).toEqual([BUNDLES[0]])
    expect(retentionCandidates([BUNDLES[0]], { keep: 1, keepDays: 1 }, NOW)).toEqual([])
  })

  it('treats zero days as no age limit', () => {
    expect(retentionCandidates(BUNDLES, { keep: 10, keepDays: 0 }, NOW)).toEqual([])
    expect(retentionCandidates(BUNDLES, { keep: 10 }, NOW)).toEqual([])
  })
})

describe('resolveKeep', () => {
  it('defaults to seven and accepts an explicit count', () => {
    expect(resolveKeep(undefined)).toBe(7)
    expect(resolveKeep('14')).toBe(14)
  })

  it('rejects zero, negatives and non-numbers, naming the flag', () => {
    for (const flag of ['0', '-1', 'seven', '1.5']) {
      expect(() => resolveKeep(flag)).toThrow('--keep')
    }
  })
})
