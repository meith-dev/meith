import { describe, expect, it } from 'vitest'

import { isRunnable, MAX_QUERY_LENGTH, MIN_TERM_LENGTH, parseSearchInput } from './query'

describe('parseSearchInput', () => {
  it('passes ordinary words through', () => {
    expect(parseSearchInput('hello world')).toEqual({ terms: 'hello world', refusal: null })
  })

  it('keeps the two conventions people actually use', () => {
    expect(parseSearchInput('"exact phrase" -excluded').terms).toBe('"exact phrase" -excluded')
  })

  it('leaves punctuation alone rather than refusing it', () => {
    for (const input of ["don't", 'tom & jerry', 'C++', 'why?', '(parens)']) {
      expect(parseSearchInput(input).refusal, input).toBeNull()
    }
  })

  it('collapses whitespace and strips control characters', () => {
    expect(parseSearchInput('  hello \t\n world  ').terms).toBe('hello world')
    expect(parseSearchInput('hel\u0000lo world').terms).toBe('hel lo world')
  })

  it('says empty and too-short differently', () => {
    expect(parseSearchInput('   ').refusal).toBe('empty')
    expect(parseSearchInput('a').refusal).toBe('too-short')
  })

  it('measures length on the words, not on the decorations', () => {
    expect(parseSearchInput('"a"').refusal).toBe('too-short')
    expect(parseSearchInput('-a').refusal).toBe('too-short')
  })

  it('accepts a short word when a long one is present', () => {
    expect(parseSearchInput('a good post').refusal).toBeNull()
  })

  it('measures against the length the caller was configured with', () => {
    expect(parseSearchInput('cat', 3).refusal).toBeNull()
    expect(parseSearchInput('cat', 4).refusal).toBe('too-short')
    expect(parseSearchInput('cats', 4).refusal).toBeNull()
  })

  it('refuses nothing above one letter when the board asks for one', () => {
    expect(parseSearchInput('a', 1).refusal).toBeNull()
    expect(parseSearchInput('a b c', 1).refusal).toBeNull()
  })

  it('still needs only one long enough word, whatever the length is', () => {
    expect(parseSearchInput('a good post', 4).refusal).toBeNull()
    expect(parseSearchInput('a b c', 4).refusal).toBe('too-short')
  })

  it('falls back to its own minimum rather than trusting a nonsense one', () => {
    for (const bad of [0, -1, 2.5, Number.NaN]) {
      expect(parseSearchInput('a', bad).refusal, String(bad)).toBe('too-short')
      expect(parseSearchInput('ab', bad).refusal, String(bad)).toBeNull()
    }
    expect(MIN_TERM_LENGTH).toBe(2)
  })

  it('refuses a paste rather than running it', () => {
    const long = 'x'.repeat(MAX_QUERY_LENGTH + 1)
    expect(parseSearchInput(long).refusal).toBe('too-long')
  })

  it('accepts input exactly at the limit', () => {
    expect(parseSearchInput('x'.repeat(MAX_QUERY_LENGTH)).refusal).toBeNull()
  })

  it('never returns terms alongside a refusal', () => {
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
