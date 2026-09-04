import { ValidationError } from '@meith/core'

import { bundleTakenAt, isBundleName } from './bundle'

export const DEFAULT_KEEP = 7

export interface RetentionPolicy {
  readonly keep: number
  readonly keepDays?: number | undefined
}

export function resolveKeep(flag: string | undefined): number {
  if (flag === undefined) return DEFAULT_KEEP
  if (!/^\d+$/.test(flag) || Number(flag) < 1 || !Number.isSafeInteger(Number(flag))) {
    throw new ValidationError(`--keep must be a whole number of bundles, 1 or more, got "${flag}".`)
  }
  return Number(flag)
}

export function pruneCandidates(names: readonly string[], keep: number): readonly string[] {
  return retentionCandidates(names, { keep })
}

export function retentionCandidates(
  names: readonly string[],
  policy: RetentionPolicy,
  now: Date = new Date(),
): readonly string[] {
  const bundles = names
    .filter((name) => isBundleName(name))
    .sort()
    .reverse()
  const beyondCount = new Set(bundles.slice(Math.max(1, policy.keep)))

  const keepDays = policy.keepDays ?? 0
  if (keepDays > 0) {
    const cutoff = now.getTime() - keepDays * 24 * 60 * 60 * 1000
    for (const name of bundles.slice(1)) {
      const takenAt = bundleTakenAt(name)
      if (takenAt !== null && takenAt.getTime() < cutoff) beyondCount.add(name)
    }
  }

  return bundles.filter((name) => beyondCount.has(name))
}
