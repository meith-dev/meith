/**
 * F72's input handling.
 *
 * The claim: **a search box is not a query language.** People type
 * apostrophes, brackets and stray operators without meaning anything by them,
 * and a board that answers those with an error is a board whose search looks
 * broken. What this module refuses is only what would be *expensive* or
 * meaningless to run — never what merely looks unusual.
 */
import { describe, expect, it } from 'vitest'

import { MAX_QUERY_LENGTH, isRunnable, parseSearchInput } from './query'

describe('parseSearchInput', () => {
  it('passes ordinary words through', () => {
    expect(parseSearchInput('hello world')).toEqual({ terms: 'hello world', refusal: null })
  })

  it('keeps the two conventions people actually use', () => {
    /*
     * Quoted phrases and a leading `-` are what members type and what
     * `websearch_to_tsquery` understands. Stripping them here would silently
     * change the search somebody asked for.
     */
    expect(parseSearchInput('"exact phrase" -excluded').terms).toBe('"exact phrase" -excluded')
  })

  it('leaves punctuation alone rather than refusing it', () => {
    /*
     * Kills the mutant that sanitises input down to word characters. An
     * apostrophe or an ampersand in a search is a normal thing to type, and a
     * syntax error in response is how search stops being used.
     *
     * Note what is *not* claimed: `A & B` is refused, and rightly — every word
     * in it is one character, so it is a short search rather than a punctuation
     * problem. The refusal has to be about cost, never about looking unusual.
     */
    for (const input of ["don't", 'tom & jerry', 'C++', 'why?', '(parens)']) {
      expect(parseSearchInput(input).refusal, input).toBeNull()
    }
  })

  it('collapses whitespace and strips control characters', () => {
    expect(parseSearchInput('  hello \t\n world  ').terms).toBe('hello world')
    expect(parseSearchInput('hel\u0000lo world').terms).toBe('hel lo world')
  })

  it('says empty and too-short differently', () => {
    /*
     * They lead to different next actions — "type something" versus "type
     * more" — so one message for both is a message that helps with neither.
     */
    expect(parseSearchInput('   ').refusal).toBe('empty')
    expect(parseSearchInput('a').refusal).toBe('too-short')
  })

  it('measures length on the words, not on the decorations', () => {
    /*
     * `"a"` and `-a` are one-character searches dressed up. Running one scans
     * the whole index to return everything. Kills the mutant that measures the
     * raw string, under which both would pass.
     */
    expect(parseSearchInput('"a"').refusal).toBe('too-short')
    expect(parseSearchInput('-a').refusal).toBe('too-short')
  })

  it('accepts a short word when a long one is present', () => {
    /* "a good post" is a real search; only *every* word being tiny is not. */
    expect(parseSearchInput('a good post').refusal).toBeNull()
  })

  it('refuses a paste rather than running it', () => {
    const long = 'x'.repeat(MAX_QUERY_LENGTH + 1)
    expect(parseSearchInput(long).refusal).toBe('too-long')
  })

  it('accepts input exactly at the limit', () => {
    /* Kills the off-by-one that refuses the boundary. */
    expect(parseSearchInput('x'.repeat(MAX_QUERY_LENGTH)).refusal).toBeNull()
  })

  it('never returns terms alongside a refusal', () => {
    /*
     * A caller that checked only `terms` must not accidentally run a refused
     * search, and one that checked only `refusal` must not lose the text.
     */
    for (const input of ['', 'a', 'x'.repeat(MAX_QUERY_LENGTH + 1)]) {
      const parsed = parseSearchInput(input)
      expect(parsed.terms).toBe('')
      expect(parsed.refusal).not.toBeNull()
    }
  })
})

describe('isRunnable', () => {
  it('is true only for input worth querying', () => {
    expect(isRunnable(parseSearchInput('hello'))).toBe(true)
    expect(isRunnable(parseSearchInput('a'))).toBe(false)
    expect(isRunnable(parseSearchInput(''))).toBe(false)
  })
})
