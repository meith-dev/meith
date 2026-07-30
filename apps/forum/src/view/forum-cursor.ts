import type { ThreadCursor } from '@forum/threads'

/** Decode the opaque keyset cursor carried by `/forum/[id]-[slug]`. */
export function decodeForumCursor(value: string | undefined): ThreadCursor | null | undefined {
  if (value === undefined) return undefined
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as { s?: unknown }).s !== 'boolean' ||
      typeof (parsed as { t?: unknown }).t !== 'string' ||
      typeof (parsed as { i?: unknown }).i !== 'number'
    ) {
      return null
    }
    const lastPostAt = new Date((parsed as { t: string }).t)
    const id = (parsed as { i: number }).i
    return Number.isSafeInteger(id) && id > 0 && !Number.isNaN(lastPostAt.getTime())
      ? { isSticky: (parsed as { s: boolean }).s, lastPostAt, id }
      : null
  } catch {
    return null
  }
}

export function encodeForumCursor(cursor: ThreadCursor): string {
  return Buffer.from(
    JSON.stringify({ s: cursor.isSticky, t: cursor.lastPostAt.toISOString(), i: cursor.id }),
  ).toString('base64url')
}
