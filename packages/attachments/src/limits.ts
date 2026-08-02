/**
 * The two numbers, and the ceilings above them.
 *
 * Its own module, with **no imports at all**, for a reason that is not
 * aesthetic: the composer's file input is a client component and it needs these
 * to say "up to 4 files, 2 MB each". Reaching them through the package barrel
 * pulls `service.ts` in, which pulls `@forum/core` in, which pulls
 * `node:async_hooks` into a browser bundle — a build error, and the right one.
 * A leaf module is what lets both sides share the arithmetic without sharing a
 * dependency graph.
 */

/**
 * Ceilings that no group permission can raise.
 *
 * `maxAttachmentSizeKb` and `maxAttachmentsPerPost` are 0-means-unlimited
 * (R4.2), and "unlimited" for a file upload is a way to fill a disk. Same
 * argument as F58's signature limit: 0 still needs a bound, and the bound
 * belongs here rather than in whatever an operator typed.
 */
export const HARD_MAX_BYTES = 16 * 1024 * 1024
export const HARD_MAX_PER_POST = 10

/** What a group's permissions allow. 0 means unlimited, before the ceilings. */
export interface UploadLimits {
  readonly maxPerPost: number
  readonly maxSizeKb: number
}

/** The effective per-file byte cap: the group's, bounded by the hard ceiling. */
export function maxBytesFor(limits: UploadLimits): number {
  const configured = limits.maxSizeKb <= 0 ? HARD_MAX_BYTES : limits.maxSizeKb * 1024
  return Math.min(configured, HARD_MAX_BYTES)
}

/** The effective per-post count cap. */
export function maxPerPostFor(limits: UploadLimits): number {
  const configured = limits.maxPerPost <= 0 ? HARD_MAX_PER_POST : limits.maxPerPost
  return Math.min(configured, HARD_MAX_PER_POST)
}
