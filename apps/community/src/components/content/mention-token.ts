export interface MentionToken {
  readonly start: number
  readonly query: string
}

const MENTION_BOUNDARY = /[\s(<*_~]/

const MENTION_TOKEN = /^[\p{L}\p{N}][\p{L}\p{N}._-]*$/u

const MAX_QUERY_LENGTH = 32

export function activeMentionToken(value: string, caret: number): MentionToken | null {
  const at = value.lastIndexOf('@', caret - 1)
  if (at === -1) return null

  const before = at === 0 ? undefined : value[at - 1]
  if (before !== undefined && !MENTION_BOUNDARY.test(before)) return null

  const query = value.slice(at + 1, caret)
  if (query.length > MAX_QUERY_LENGTH || !MENTION_TOKEN.test(query)) return null

  return { start: at, query }
}
