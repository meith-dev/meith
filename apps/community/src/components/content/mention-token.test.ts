import { describe, expect, it } from 'vitest'

import { activeMentionToken } from './mention-token'

function caretAt(marked: string): { value: string; caret: number } {
  const caret = marked.indexOf('‹')
  return { value: marked.replace('‹', ''), caret }
}

function tokenAt(marked: string): ReturnType<typeof activeMentionToken> {
  const { value, caret } = caretAt(marked)
  return activeMentionToken(value, caret)
}

describe('activeMentionToken', () => {
  it('finds the partial name right after an @ at the start of the text', () => {
    expect(tokenAt('@al‹')).toEqual({ start: 0, query: 'al' })
  })

  it('finds it after whitespace, mid-sentence', () => {
    expect(tokenAt('hi @al‹')).toEqual({ start: 3, query: 'al' })
  })

  it('is null before any @ has been typed', () => {
    expect(tokenAt('hi al‹')).toBeNull()
  })

  it('is null once the caret has moved past a space, ending the token', () => {
    expect(tokenAt('@al ‹')).toBeNull()
  })

  it('is null right after the @ with nothing typed yet, not an empty query', () => {
    expect(tokenAt('@‹')).toBeNull()
  })

  it('does not fire mid-word, so an e-mail address stays an address', () => {
    expect(tokenAt('a@example.co‹')).toBeNull()
  })

  it('fires after an opening bracket, paren, or emphasis marker', () => {
    expect(tokenAt('(@al‹')).toEqual({ start: 1, query: 'al' })
    expect(tokenAt('*@al‹')).toEqual({ start: 1, query: 'al' })
  })

  it('finds the nearest @ before the caret, not an earlier unrelated one', () => {
    expect(tokenAt('a@example.com and @al‹')).toEqual({ start: 18, query: 'al' })
  })

  it('is null once the query is longer than a mention could ever be', () => {
    expect(tokenAt(`@${'x'.repeat(33)}‹`)).toBeNull()
  })

  it('is null for the quoted multi-word form, which the typeahead does not offer', () => {
    expect(tokenAt('@"Ada L‹')).toBeNull()
  })
})
