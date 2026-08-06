import { describe, expect, it } from 'vitest'

import { renderMarkdown } from './body'

const html = (source: string): string => renderMarkdown(source).html
const inline = (source: string): string => html(source).replace(/^<p>|<\/p>$/g, '')

describe('emphasis', () => {
  it('reads the three kinds and their combination', () => {
    expect(inline('**bold**')).toBe('<strong>bold</strong>')
    expect(inline('*italic*')).toBe('<em>italic</em>')
    expect(inline('~~gone~~')).toBe('<s>gone</s>')
    expect(inline('***both***')).toBe('<em><strong>both</strong></em>')
  })

  it('leaves an underscore inside a word alone', () => {
    expect(inline('snake_case_name')).toBe('snake_case_name')
    expect(inline('_leading and trailing_')).toBe('<em>leading and trailing</em>')
  })

  it('leaves a spaced asterisk as multiplication', () => {
    expect(inline('2 * 3 * 4')).toBe('2 * 3 * 4')
  })

  it('nests innermost-first, so a strong inside an emphasis reads as written', () => {
    expect(inline('*foo**bar**baz*')).toBe('<em>foo<strong>bar</strong>baz</em>')
  })

  it('leaves an unmatched delimiter as the character it is', () => {
    expect(inline('a * b')).toBe('a * b')
    expect(inline('**unclosed')).toBe('**unclosed')
  })
})

describe('code spans', () => {
  it('takes everything inside verbatim', () => {
    expect(inline('`**not bold**`')).toBe('<code class="md-code-span">**not bold**</code>')
  })

  it('lets a longer fence hold a backtick', () => {
    expect(inline('`` a ` b ``')).toBe('<code class="md-code-span">a ` b</code>')
  })

  it('leaves an unterminated one as backticks', () => {
    expect(inline('a ` b')).toBe('a ` b')
  })
})

describe('links', () => {
  it('reads the inline form, with and without a title', () => {
    expect(inline('[text](https://x.test)')).toContain('>text</a>')
    expect(inline('[text](https://x.test "why")')).toContain('title="why"')
  })

  it('balances parentheses in a destination, because half of Wikipedia needs it', () => {
    expect(inline('[x](https://x.test/A_(b))')).toContain('href="https://x.test/A_(b)"')
  })

  it('autolinks a bare URL, and gives the sentence its full stop back', () => {
    const out = inline('see https://x.test/a.')
    expect(out).toContain('href="https://x.test/a"')
    expect(out.endsWith('.')).toBe(true)
  })

  it('autolinks a `www.` host with an explicit scheme', () => {
    expect(inline('www.x.test')).toContain('href="https://www.x.test"')
  })

  it('reads the angle-bracket forms', () => {
    expect(inline('<https://x.test>')).toContain('href="https://x.test"')
    expect(inline('<a@b.test>')).toContain('href="mailto:a@b.test"')
  })

  it('does not nest a link inside a link', () => {
    const out = inline('[see https://inner.test](https://outer.test)')
    expect(out.match(/<a /g)).toHaveLength(1)
  })

  it('leaves a bracket that opens nothing as a bracket', () => {
    expect(inline('[not a link]')).toBe('[not a link]')
  })
})

describe('escapes', () => {
  it('makes a backslashed marker literal', () => {
    expect(inline('\\*not italic\\*')).toBe('*not italic*')
  })

  it('leaves a backslash that escapes nothing alone', () => {
    expect(inline('C:\\path')).toBe('C:\\path')
  })
})

describe('line breaks', () => {
  it('turns every newline in a paragraph into one', () => {
    expect(inline('a\nb\nc')).toBe('a<br>\nb<br>\nc')
  })
})

describe('the delimiter ceiling', () => {
  it('stops pairing rather than going quadratic on a wall of asterisks', () => {
    const source = `${'*x'.repeat(5000)}*`
    const started = Date.now()
    const out = renderMarkdown(source)

    expect(Date.now() - started).toBeLessThan(2000)
    expect(out.html).toContain('x')
  })
})
