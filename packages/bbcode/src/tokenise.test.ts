/** F36 — the scanner's one job: does this `[` start a tag, or is it text? */
import { describe, expect, it } from 'vitest'

import { RAW_TAGS } from './tags'
import { tokenise, type BBToken } from './tokenise'

const OPTIONS = { rawTags: RAW_TAGS, maxInput: 10_000 }

function run(source: string): BBToken[] {
  return tokenise(source, OPTIONS)
}

describe('tokenise', () => {
  it('splits tags from text', () => {
    expect(run('hi [b]there[/b]!')).toEqual([
      { kind: 'text', raw: 'hi ', value: 'hi ' },
      { kind: 'open', raw: '[b]', name: 'b', attribute: null },
      { kind: 'text', raw: 'there', value: 'there' },
      { kind: 'close', raw: '[/b]', name: 'b' },
      { kind: 'text', raw: '!', value: '!' },
    ])
  })

  it('lower-cases tag names but keeps the attribute verbatim', () => {
    const [token] = run('[URL=https://Example.com/A]x[/URL]')
    expect(token).toEqual({
      kind: 'open',
      raw: '[URL=https://Example.com/A]',
      name: 'url',
      attribute: 'https://Example.com/A',
    })
  })

  it('treats a bracket that opens nothing as text', () => {
    expect(run('[not a tag]')).toEqual([
      { kind: 'text', raw: '[not a tag]', value: '[not a tag]' },
    ])
  })

  /*
   * The case a "scan to the next ]" tokeniser gets wrong. If the first bracket
   * swallowed everything up to the first `]`, the [b] inside it would never be
   * seen and the rest of the post would not render.
   */
  it('gives up on an outer bracket rather than swallowing a real tag', () => {
    expect(run('[oh no [b]bold[/b]')).toEqual([
      { kind: 'text', raw: '[oh no ', value: '[oh no ' },
      { kind: 'open', raw: '[b]', name: 'b', attribute: null },
      { kind: 'text', raw: 'bold', value: 'bold' },
      { kind: 'close', raw: '[/b]', name: 'b' },
    ])
  })

  it('does not let a tag span a newline', () => {
    expect(run('[b\n]x')).toEqual([{ kind: 'text', raw: '[b\n]x', value: '[b\n]x' }])
  })

  it('rejects an over-long tag', () => {
    const source = `[quote=${'a'.repeat(300)}]x[/quote]`
    const kinds = run(source).map((token) => token.kind)
    expect(kinds).not.toContain('open')
  })

  it('rejects a closing tag with an attribute', () => {
    expect(run('[/b=x]')).toEqual([{ kind: 'text', raw: '[/b=x]', value: '[/b=x]' }])
  })

  describe('raw tags', () => {
    it('takes the body verbatim, tags and all', () => {
      expect(run('[code][b]not bold[/b][/code]')).toEqual([
        {
          kind: 'raw',
          raw: '[code][b]not bold[/b][/code]',
          name: 'code',
          attribute: null,
          value: '[b]not bold[/b]',
        },
      ])
    })

    it('matches the close case-insensitively', () => {
      const [token] = run('[code]x[/CODE]')
      expect(token).toMatchObject({ kind: 'raw', value: 'x' })
    })

    /*
     * The close is found by index into the *original* string. Lower-casing a
     * copy to search it would shift every index past a character whose
     * lower-case form is longer — `İ` is two code units — and split the body
     * mid-character. This is that character, before the code block.
     */
    it('is not thrown off by a character that changes length when lower-cased', () => {
      const [text, raw] = run('İ [code]body[/code]')
      expect(text).toMatchObject({ kind: 'text', value: 'İ ' })
      expect(raw).toMatchObject({ kind: 'raw', value: 'body' })
    })

    it('leaves an unterminated raw tag as text so the rest still renders', () => {
      expect(run('[code]forever [b]bold[/b]')).toEqual([
        { kind: 'text', raw: '[code]forever ', value: '[code]forever ' },
        { kind: 'open', raw: '[b]', name: 'b', attribute: null },
        { kind: 'text', raw: 'bold', value: 'bold' },
        { kind: 'close', raw: '[/b]', name: 'b' },
      ])
    })
  })

  it('keeps the tail past maxInput as text, losing nothing', () => {
    const tokens = tokenise('[b]x[/b] tail', { rawTags: RAW_TAGS, maxInput: 3 })
    expect(tokens.map((token) => token.raw).join('')).toBe('[b]x[/b] tail')
    expect(tokens.at(-1)).toEqual({ kind: 'text', raw: 'x[/b] tail', value: 'x[/b] tail' })
  })

  it('reproduces its input exactly from token.raw', () => {
    const source = "a [b]b[/b] [code]c[/code] [url='x'] [ [/i] [*]"
    expect(
      run(source)
        .map((token) => token.raw)
        .join(''),
    ).toBe(source)
  })
})
