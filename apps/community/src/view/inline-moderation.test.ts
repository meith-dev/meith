import { describe, expect, it } from 'vitest'

import {
  INLINE_FORM_ID,
  NO_INLINE_TOOLS,
  anyInlineTool,
  inlineOutcomeNotice,
  selectionFor,
} from './inline-moderation'

describe('selectionFor', () => {
  it('is null when this viewer is offered no tools, so no checkbox is rendered', () => {
    expect(selectionFor('thread', 12, '“Hello”', false)).toBeNull()
  })

  it('carries the form id the app-rendered bar uses', () => {
    expect(selectionFor('thread', 12, '“Hello”', true)).toEqual({
      name: 'item',
      value: 'thread:12',
      formId: INLINE_FORM_ID,
      label: 'Select “Hello” for moderation',
    })
  })

  it('encodes a post the same way the queue does', () => {
    expect(selectionFor('post', 7, 'post #3', true)?.value).toBe('post:7')
  })
})

describe('anyInlineTool', () => {
  it('is false when nothing is offered', () => {
    expect(anyInlineTool(NO_INLINE_TOOLS)).toBe(false)
  })

  it('is true when one is', () => {
    expect(anyInlineTool({ ...NO_INLINE_TOOLS, delete: true })).toBe(true)
  })
})

describe('inlineOutcomeNotice', () => {
  it('is null when no action was taken', () => {
    expect(inlineOutcomeNotice({})).toBeNull()
  })

  it('reports the plain case in one sentence', () => {
    expect(inlineOutcomeNotice({ did: 'lock', n: '3' })).toBe('3 items locked.')
  })

  it('says "item" for one', () => {
    expect(inlineOutcomeNotice({ did: 'delete', n: '1' })).toBe('1 item deleted.')
  })

  it('names each cause separately', () => {
    expect(
      inlineOutcomeNotice({ did: 'delete', n: '9', refused: '1', gone: '1', skipped: '1' }),
    ).toBe(
      '9 items deleted. 1 refused — you cannot do that there. 1 no longer available. 1 already in that state.',
    )
  })

  it('ignores counts that are not numbers', () => {
    expect(inlineOutcomeNotice({ did: 'lock', n: 'lots', refused: '../etc' })).toBe(
      '0 items locked.',
    )
  })

  it('survives a tool it has no past tense for', () => {
    expect(inlineOutcomeNotice({ did: 'incinerate', n: '2' })).toBe('2 items incinerate.')
  })
})
