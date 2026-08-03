/**
 * F72 — turning what a member typed into something a provider can run.
 *
 * **A search box is not a query language.** People type apostrophes, brackets,
 * ampersands and the occasional `&&` without meaning anything by them, and a
 * board that answers those with a syntax error is a board whose search looks
 * broken. Postgres offers `websearch_to_tsquery` for exactly this reason: it
 * accepts arbitrary text, understands the two conventions people actually use
 * — `"quoted phrases"` and a leading `-` for exclusion — and never raises.
 *
 * So this module does not build a `tsquery`. It normalises input to the point
 * where handing it to `websearch_to_tsquery` is safe and predictable, and it
 * answers one question the provider cannot: **is there anything here to search
 * for at all?**
 */

/** The shortest term worth running a full-text query for. */
export const MIN_TERM_LENGTH = 2

/** Beyond this, the input is a paste rather than a search. */
export const MAX_QUERY_LENGTH = 200

export interface ParsedSearchInput {
  /** Cleaned text to hand to the provider. Empty when there is nothing to run. */
  readonly terms: string
  /**
   * Why an empty result is empty.
   *
   * `null` when the input is fine. Otherwise a reason the screen can show, so
   * "no results" and "your search was too short" are never the same message —
   * they lead to completely different next actions.
   */
  readonly refusal: 'empty' | 'too-short' | 'too-long' | null
}

/**
 * Normalise a search box's contents.
 *
 * What survives: quoted phrases, a leading `-` on a word, and the words
 * themselves. What does not: control characters, and runs of whitespace.
 * Everything else is left alone for `websearch_to_tsquery` to interpret,
 * because second-guessing it here is how the parser and the engine end up
 * disagreeing about what the member asked for.
 */
export function parseSearchInput(raw: string): ParsedSearchInput {
  /*
   * Control characters are stripped rather than rejected: they arrive from
   * paste accidents and mean nothing, and refusing the search over an invisible
   * character is a message nobody can act on.
   */
  const cleaned = raw
    // eslint-disable-next-line no-control-regex -- matching control characters is the point: they are what is being removed
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (cleaned === '') return { terms: '', refusal: 'empty' }
  if (cleaned.length > MAX_QUERY_LENGTH) return { terms: '', refusal: 'too-long' }

  /*
   * Length is measured on the *words*, not on the raw string: `"a"` and `-a`
   * are one-character searches dressed up, and a board that ran them would scan
   * its whole index to return everything. Quotes and the exclusion marker are
   * stripped before measuring for that reason.
   */
  const longest = cleaned
    .split(' ')
    .map((word) => word.replace(/^-/, '').replace(/"/g, ''))
    .reduce((best, word) => Math.max(best, word.length), 0)

  if (longest < MIN_TERM_LENGTH) return { terms: '', refusal: 'too-short' }

  return { terms: cleaned, refusal: null }
}

/**
 * Is this input worth running?
 *
 * Separate from the parse so a caller can decide *not to query at all* rather
 * than querying and discarding — on a board with two million posts the
 * difference between those is the difference between a page that renders and
 * one that times out.
 */
export function isRunnable(parsed: ParsedSearchInput): boolean {
  return parsed.refusal === null && parsed.terms !== ''
}
