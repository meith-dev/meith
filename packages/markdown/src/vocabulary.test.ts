import { describe, expect, it } from 'vitest'

import { renderMarkdown, vocabularyOptions } from './body'
import { compileSmilies, createDirectiveRegistry, directiveNames } from './extensions'
import { EMPTY_VOCABULARY, compileVocabulary } from './vocabulary'

describe('directives', () => {
  it('renders a block one as a div and an inline one as a span', () => {
    const vocabulary = compileVocabulary({
      revision: 1,
      smilies: [],
      directives: [
        { name: 'spoiler', block: true },
        { name: 'kbd', block: false },
      ],
    })

    const block = renderMarkdown(':::spoiler\nthe ending\n:::', vocabularyOptions(vocabulary)).html
    expect(block).toContain('<div class="md-directive md-directive-spoiler">')

    const span = renderMarkdown(':kbd[Ctrl]', vocabularyOptions(vocabulary)).html
    expect(span).toContain('<span class="md-directive md-directive-kbd">Ctrl</span>')
  })

  it('leaves a name the board has not defined as the text it is', () => {
    const out = renderMarkdown(':::mystery\nkept\n:::').html
    expect(out).toContain('kept')
    expect(out).not.toContain('md-directive')
  })

  it('refuses a bad name at the form, where an operator can be told', () => {
    expect(() => createDirectiveRegistry([{ name: '1bad', block: false }])).toThrow()
    expect(() => createDirectiveRegistry([{ name: 'a'.repeat(20), block: false }])).toThrow()
    expect(() =>
      createDirectiveRegistry([
        { name: 'spoiler', block: false },
        { name: 'spoiler', block: true },
      ]),
    ).toThrow()
  })

  it('drops one bad row on the render path, and keeps the rest', () => {
    const vocabulary = compileVocabulary({
      revision: 3,
      smilies: [],
      directives: [
        { name: 'spoiler', block: true },
        { name: '!!', block: false },
        { name: 'kbd', block: false },
      ],
    })

    expect(directiveNames(vocabulary.directives)).toEqual(['kbd', 'spoiler'])
    expect(vocabulary.rejected).toHaveLength(1)
    expect(vocabulary.rejected[0]?.kind).toBe('directive')
  })
})

describe('smilies', () => {
  it('matches the longest code at a position, so `:-)` beats `:)`', () => {
    const compiled = compileSmilies([
      { code: ':)', src: '/a.png' },
      { code: ':-)', src: '/b.png' },
    ])
    expect(compiled.entries[0]?.code).toBe(':-)')
  })

  it('refuses a code with whitespace, which would match half a sentence', () => {
    expect(() => compileSmilies([{ code: ': )', src: '/a.png' }])).toThrow()
  })

  it('defaults the alt text to the code, so it reads as what was typed', () => {
    const compiled = compileSmilies([{ code: ':)', src: '/a.png' }])
    expect(compiled.entries[0]?.alt).toBe(':)')
  })
})

describe('the empty vocabulary', () => {
  it('is revision zero, which is what every stored render is already stamped', () => {
    expect(EMPTY_VOCABULARY.revision).toBe(0)
    expect(EMPTY_VOCABULARY.smilies).toBeUndefined()
  })

  it('costs the render path nothing', () => {
    expect(vocabularyOptions(undefined)).toEqual({})
  })

  it('carries the directives and the smilies together, or neither', () => {
    const vocabulary = compileVocabulary({
      revision: 2,
      smilies: [{ code: ':)', src: '/a.png' }],
      directives: [{ name: 'spoiler', block: true }],
    })

    const options = vocabularyOptions(vocabulary)
    expect(options.smilies).toBeDefined()
    expect(options.directives).toBe(vocabulary.directives)
  })
})
