import { describe, expect, it } from 'vitest'

import { applyWordFilter, compileWordFilter } from './word-filter'

const filter = (...rules: Array<{ pattern: string; replacement: string; wholeWord?: boolean }>) =>
  compileWordFilter(rules.map((rule) => ({ ...rule, wholeWord: rule.wholeWord ?? true })))

describe('applyWordFilter', () => {
  it('replaces a word in text', () => {
    const result = applyWordFilter(
      '<p>a badword here</p>',
      filter({ pattern: 'badword', replacement: '***' }),
    )
    expect(result).toBe('<p>a *** here</p>')
  })

  it('never substitutes inside a tag', () => {
    const html = '<a href="https://example.com/example">example</a>'
    const result = applyWordFilter(html, filter({ pattern: 'example', replacement: 'X' }))

    expect(result).toBe('<a href="https://example.com/example">X</a>')
  })

  it('leaves an image source alone while filtering the text beside it', () => {
    const html = '<p>cat <img src="/cat.png" alt="cat"> cat</p>'
    const result = applyWordFilter(html, filter({ pattern: 'cat', replacement: 'dog' }))

    expect(result).toBe('<p>dog <img src="/cat.png" alt="cat"> dog</p>')
  })

  it('is case-insensitive but keeps the replacement as written', () => {
    const result = applyWordFilter(
      'BadWord badword BADWORD',
      filter({ pattern: 'badword', replacement: 'ok' }),
    )
    expect(result).toBe('ok ok ok')
  })

  it('matches whole words only when asked', () => {
    const whole = applyWordFilter('classic class', filter({ pattern: 'class', replacement: 'X' }))
    expect(whole).toBe('classic X')

    const substring = applyWordFilter(
      'classic class',
      filter({ pattern: 'class', replacement: 'X', wholeWord: false }),
    )
    expect(substring).toBe('Xic X')
  })

  it('treats a pattern as text, never as a regular expression', () => {
    const result = applyWordFilter('a.c abc', filter({ pattern: 'a.c', replacement: 'X' }))
    expect(result).toBe('X abc')
  })

  it('applies every rule, in order', () => {
    const result = applyWordFilter(
      'one two',
      filter({ pattern: 'one', replacement: '1' }, { pattern: 'two', replacement: '2' }),
    )
    expect(result).toBe('1 2')
  })

  it('can remove a word entirely', () => {
    expect(
      applyWordFilter('say nothing here', filter({ pattern: 'nothing', replacement: '' })),
    ).toBe('say  here')
  })

  it('is a no-op with no rules', () => {
    const html = '<p>anything at all</p>'
    expect(applyWordFilter(html, compileWordFilter([]))).toBe(html)
  })

  it('drops an empty pattern rather than matching everywhere', () => {
    const html = '<p>hello</p>'
    expect(applyWordFilter(html, filter({ pattern: '', replacement: 'X' }))).toBe(html)
  })

  it('filters the same rule set across several bodies', () => {
    const compiled = filter({ pattern: 'x', replacement: 'y' })

    expect(applyWordFilter('x x x', compiled)).toBe('y y y')
    expect(applyWordFilter('x x x', compiled)).toBe('y y y')
    expect(applyWordFilter('x x x', compiled)).toBe('y y y')
  })

  it('copies an unterminated tag through rather than corrupting it', () => {
    const html = '<p>ok</p><a href="ok'
    expect(applyWordFilter(html, filter({ pattern: 'ok', replacement: 'X' }))).toBe(
      '<p>X</p><a href="ok',
    )
  })

  it('leaves the input alone, so nothing stored is changed', () => {
    const html = '<p>badword</p>'
    applyWordFilter(html, filter({ pattern: 'badword', replacement: '***' }))
    expect(html).toBe('<p>badword</p>')
  })
})
