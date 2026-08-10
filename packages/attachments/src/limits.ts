export const HARD_MAX_BYTES = 16 * 1024 * 1024
export const HARD_MAX_PER_POST = 10

export interface UploadLimits {
  readonly maxPerPost: number
  readonly maxSizeKb: number
}

export function maxBytesFor(limits: UploadLimits): number {
  const configured = limits.maxSizeKb <= 0 ? HARD_MAX_BYTES : limits.maxSizeKb * 1024
  return Math.min(configured, HARD_MAX_BYTES)
}

export function maxPerPostFor(limits: UploadLimits): number {
  const configured = limits.maxPerPost <= 0 ? HARD_MAX_PER_POST : limits.maxPerPost
  return Math.min(configured, HARD_MAX_PER_POST)
}
