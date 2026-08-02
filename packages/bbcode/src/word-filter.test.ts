/**
 * F71's word filter.
 *
 * Two claims carry it:
 *
 *  - **markup is never substituted.** This runs on rendered HTML, so a naive
 *    replace rewrites the inside of `<a href="…">` — turning a filtered word in
 *    a URL into a broken link, and a short pattern into a catastrophe;
 *  - **the post is never changed**, so the filter is reversible: removing a rule
 *    restores the word on the next render, which is the whole reason this
 *    happens here rather than on save.
 */
import { describe, expect, it } from 'vitest'

import { applyWordFilter, compileWordFilter } from './word-filter'

const filter = (
  ...rules: Array<{ pattern: string; replacement: string; wholeWord?: boolean }>
) =>
  compileWordFilter(
    rules.map((rule) => ({ ...rule, wholeWord: rule.wholeWord ?? true })),
  )

describe('applyWordFilter', () => {
  it('replaces a word in text', () => {
    const result = applyWordFilter('<p>a badword here</p>', filter({ pattern: 'badword', replacement: '***' }))
    expect(result).toBe('<p>a *** here</p>')
  })

  it('never substitutes inside a tag', () => {
    /*
     * The claim. A filter on "example" must not rewrite the href — the link
     * would silently stop working, and nothing about the post would look wrong.
     * Kills the mutant that replaces across the whole string.
     */
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
    const result = applyWordFilter('BadWord badword BADWORD', filter({ pattern: 'badword', replacement: 'ok' }))
    expect(result).toBe('ok ok ok')
  })

  it('matches whole words only when asked', () => {
    /*
     * The Scunthorpe problem, and the reason whole-word is the default in the
     * editor: a substring filter silently mangles place names and surnames, and
     * the member it happens to has no idea why their post looks wrong.
     */
    const whole = applyWordFilter('classic class', filter({ pattern: 'class', replacement: 'X' }))
    expect(whole).toBe('classic X')

    const substring = applyWordFilter(
      'classic class',
      filter({ pattern: 'class', replacement: 'X', wholeWord: false }),
    )
    expect(substring).toBe('Xic X')
  })

  it('treats a pattern as text, never as a regular expression', () => {
    /*
     * A pattern typed into an admin form runs on every post body on the render
     * path. Letting it be a regex makes a catastrophically backtracking one a
     * board that stops rendering. Kills the mutant that skips escaping.
     */
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
    expect(applyWordFilter('say nothing here', filter({ pattern: 'nothing', replacement: '' })))
      .toBe('say  here')
  })

  it('is a no-op with no rules', () => {
    const html = '<p>anything at all</p>'
    expect(applyWordFilter(html, compileWordFilter([]))).toBe(html)
  })

  it('drops an empty pattern rather than matching everywhere', () => {
    /*
     * An empty pattern compiles to a regex that matches at every position, so
     * a blank row left in the editor would insert the replacement between every
     * character of every post. Kills the mutant that keeps it.
     */
    const html = '<p>hello</p>'
    expect(applyWordFilter(html, filter({ pattern: '', replacement: 'X' }))).toBe(html)
  })

  it('filters the same rule set across several bodies', () => {
    /*
     * The matchers are global regexes reused for every post in a render pass.
     * `String#replace` is immune to the stateful-`lastIndex` trap that would
     * otherwise make the filter work on the first post and skip the rest — this
     * pins that, so a future change to `exec` fails here rather than in
     * production.
     */
    const compiled = filter({ pattern: 'x', replacement: 'y' })

    expect(applyWordFilter('x x x', compiled)).toBe('y y y')
    expect(applyWordFilter('x x x', compiled)).toBe('y y y')
    expect(applyWordFilter('x x x', compiled)).toBe('y y y')
  })

  it('copies an unterminated tag through rather than corrupting it', () => {
    /*
     * The filtered word appears inside the broken tag on purpose: a test whose
     * pattern does not occur there passes whether the tail is filtered or
     * copied, and proves nothing. This cannot arise from the renderer's own
     * output, and leaving it alone is the failure that does not also corrupt it.
     */
    const html = '<p>ok</p><a href="ok'
    expect(applyWordFilter(html, filter({ pattern: 'ok', replacement: 'X' })))
      .toBe('<p>X</p><a href="ok')
  })

  it('leaves the input alone, so nothing stored is changed', () => {
    /*
     * The reversibility claim in its simplest form: this is a pure function of
     * the rendered HTML, and the post it came from is untouched. Removing a
     * rule restores the word on the next render.
     */
    const html = '<p>badword</p>'
    applyWordFilter(html, filter({ pattern: 'badword', replacement: '***' }))
    expect(html).toBe('<p>badword</p>')
  })
})
