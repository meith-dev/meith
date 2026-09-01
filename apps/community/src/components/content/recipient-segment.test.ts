import { describe, expect, it } from 'vitest'

import { activeRecipientSegment, fillRecipient } from './recipient-segment'

function caretAt(marked: string): { value: string; caret: number } {
  const caret = marked.indexOf('‹')
  return { value: marked.replace('‹', ''), caret }
}

function segmentAt(marked: string): ReturnType<typeof activeRecipientSegment> {
  const { value, caret } = caretAt(marked)
  return activeRecipientSegment(value, caret)
}

describe('activeRecipientSegment', () => {
  it('finds the partial name being typed as the first recipient', () => {
    expect(segmentAt('al‹')).toEqual({ start: 0, end: 2, query: 'al' })
  })

  it('finds the partial name after a comma, ignoring the leading space', () => {
    expect(segmentAt('alice, bo‹')).toEqual({ start: 6, end: 9, query: 'bo' })
  })

  it('treats a semicolon as a separator too', () => {
    expect(segmentAt('alice; bo‹')).toEqual({ start: 6, end: 9, query: 'bo' })
  })

  it('is null right after a separator, with nothing typed yet', () => {
    expect(segmentAt('alice,‹')).toBeNull()
    expect(segmentAt('alice, ‹')).toBeNull()
  })

  it('is null when the segment is only whitespace', () => {
    expect(segmentAt('  ‹')).toBeNull()
  })

  it('is null when the segment holds a space, which no username does', () => {
    expect(segmentAt('ada l‹')).toBeNull()
  })

  it('is null once the query is longer than a username could be', () => {
    expect(segmentAt(`${'x'.repeat(33)}‹`)).toBeNull()
  })
})

describe('fillRecipient', () => {
  function fillAt(marked: string, username: string) {
    const { value, caret } = caretAt(marked)
    const segment = activeRecipientSegment(value, caret)
    if (segment === null) throw new Error('no active segment')
    return fillRecipient(value, segment, username)
  }

  it('completes the only name and leaves a trailing separator to type the next', () => {
    expect(fillAt('bo‹', 'bob')).toEqual({ value: 'bob, ', caret: 5 })
  })

  it('completes a later name, keeping the comma-separated list clean', () => {
    expect(fillAt('alice, bo‹', 'bob')).toEqual({ value: 'alice, bob, ', caret: 12 })
  })

  it('replaces the partial segment in place when there is text after the caret', () => {
    expect(fillAt('alice, bo‹, carol', 'bob')).toEqual({
      value: 'alice, bob, carol',
      caret: 12,
    })
  })
})
