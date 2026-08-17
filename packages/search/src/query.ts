export const MIN_TERM_LENGTH = 2

export const MAX_QUERY_LENGTH = 200

export interface ParsedSearchInput {
  readonly terms: string
  readonly refusal: 'empty' | 'too-short' | 'too-long' | null
}

export function parseSearchInput(
  raw: string,
  minTermLength: number = MIN_TERM_LENGTH,
): ParsedSearchInput {
  const shortest =
    Number.isInteger(minTermLength) && minTermLength >= 1 ? minTermLength : MIN_TERM_LENGTH

  const cleaned = raw
    // biome-ignore lint/suspicious/noControlCharactersInRegex: matching control characters is the point: they are what is being removed
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (cleaned === '') return { terms: '', refusal: 'empty' }
  if (cleaned.length > MAX_QUERY_LENGTH) return { terms: '', refusal: 'too-long' }

  const longest = cleaned
    .split(' ')
    .map((word) => word.replace(/^-/, '').replace(/"/g, ''))
    .reduce((best, word) => Math.max(best, word.length), 0)

  if (longest < shortest) return { terms: '', refusal: 'too-short' }

  return { terms: cleaned, refusal: null }
}

export function isRunnable(parsed: ParsedSearchInput): boolean {
  return parsed.refusal === null && parsed.terms !== ''
}
