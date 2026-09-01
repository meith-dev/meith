export interface RecipientSegment {
  readonly start: number
  readonly end: number
  readonly query: string
}

const SEPARATORS = new Set([',', ';', '\n'])

const MAX_QUERY_LENGTH = 32

export function activeRecipientSegment(value: string, caret: number): RecipientSegment | null {
  let start = 0
  for (let index = caret - 1; index >= 0; index -= 1) {
    const char = value[index]
    if (char !== undefined && SEPARATORS.has(char)) {
      start = index + 1
      break
    }
  }

  const raw = value.slice(start, caret)
  const query = raw.trim()
  if (query === '' || query.length > MAX_QUERY_LENGTH || /\s/.test(query)) return null

  return { start, end: caret, query }
}

export function fillRecipient(
  value: string,
  segment: RecipientSegment,
  username: string,
): { readonly value: string; readonly caret: number } {
  const before = value.slice(0, segment.start)
  const after = value.slice(segment.end).replace(/^[\s,;]+/, '')
  const lead = before === '' || before.endsWith(' ') ? '' : ' '
  const insert = `${lead}${username}, `

  return { value: before + insert + after, caret: before.length + insert.length }
}
