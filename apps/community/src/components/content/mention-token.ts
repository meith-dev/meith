export interface MentionToken {
  readonly start: number
  readonly query: string
}

// Mirrors the boundary rule packages/markdown/src/inline.ts uses for a bare
// `@name` mention — an '@' only starts a mention right after whitespace, or
// one of these opening characters, never mid-word (an e-mail address stays one).
const MENTION_BOUNDARY = /[\s(<*_~]/

// The bare mention grammar's character set. The quoted `@"multi word"` form
// exists in the renderer but is not offered by the typeahead — it is a rare
// enough shape that a member who wants it can still type it by hand.
const MENTION_TOKEN = /^[\p{L}\p{N}][\p{L}\p{N}._-]*$/u

const MAX_QUERY_LENGTH = 32

/**
 * The `@partial` mention the caret currently sits inside of, if any — the
 * composer's cue to show suggestions. Returns null the instant the caret
 * leaves that token: past a space, before the `@`, or past the query length
 * a mention could ever usefully match.
 */
export function activeMentionToken(value: string, caret: number): MentionToken | null {
  const at = value.lastIndexOf('@', caret - 1)
  if (at === -1) return null

  const before = at === 0 ? undefined : value[at - 1]
  if (before !== undefined && !MENTION_BOUNDARY.test(before)) return null

  const query = value.slice(at + 1, caret)
  if (query.length > MAX_QUERY_LENGTH || !MENTION_TOKEN.test(query)) return null

  return { start: at, query }
}
