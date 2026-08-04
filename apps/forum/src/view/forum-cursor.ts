import type { ThreadCursor } from '@meith/threads'

/** Decode the opaque keyset cursor carried by `/forum/[id]-[slug]`. */
export function decodeForumCursor(
  value: string | undefined,
): ThreadCursor | null | undefined {
  if (value === undefined) return undefined
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    )
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      ((parsed as { o?: unknown }).o !== 'activity' &&
        (parsed as { o?: unknown }).o !== 'rating') ||
      typeof (parsed as { s?: unknown }).s !== 'boolean' ||
      typeof (parsed as { t?: unknown }).t !== 'string' ||
      !Number.isSafeInteger((parsed as { r?: unknown }).r) ||
      !Number.isSafeInteger((parsed as { n?: unknown }).n) ||
      typeof (parsed as { i?: unknown }).i !== 'number'
    ) {
      return null
    }
    const lastPostAt = new Date((parsed as { t: string }).t)
    const ratingTotal = (parsed as { r: number }).r
    const ratingCount = (parsed as { n: number }).n
    const id = (parsed as { i: number }).i
    return Number.isSafeInteger(id) &&
      id > 0 &&
      ratingTotal >= 0 &&
      ratingCount >= 0 &&
      !Number.isNaN(lastPostAt.getTime())
      ? {
          sort: (parsed as { o: 'activity' | 'rating' }).o,
          isSticky: (parsed as { s: boolean }).s,
          lastPostAt,
          ratingTotal,
          ratingCount,
          id,
        }
      : null
  } catch {
    return null
  }
}

export function encodeForumCursor(cursor: ThreadCursor): string {
  return Buffer.from(
    JSON.stringify({
      o: cursor.sort,
      s: cursor.isSticky,
      t: cursor.lastPostAt.toISOString(),
      r: cursor.ratingTotal,
      n: cursor.ratingCount,
      i: cursor.id,
    }),
  ).toString('base64url')
}
