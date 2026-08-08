/**
 * Mentions — the syntax, and the two readers built on it.
 *
 * The rendering half proves `@name` becomes a constructed link and nothing an
 * author types can change where it points. The extraction half proves the
 * notification producer's inputs agree with the page: a name is extracted
 * exactly when the render would have linked it, and a quoted author is found
 * exactly where `quoteBlock` writes attributions.
 */
import { describe, expect, it } from 'vitest'

import { renderMarkdown } from './body'
import { SIGNATURE_FEATURES } from './features'
import { extractMentions, extractQuotedAuthors } from './mentions'
import { plainText } from './plain'
import { quoteBlock } from './quote'

const html = (source: string): string => renderMarkdown(source).html
const inline = (source: string): string => html(source).replace(/^<p>|<\/p>$/g, '')

const link = (name: string, encoded = name): string =>
  `<a class="md-mention" href="/member/by-name/${encoded}">@${name}</a>`

describe('mention syntax', () => {
  it('links a bare mention to the by-name profile route', () => {
    expect(inline('thanks @wren')).toBe(`thanks ${link('wren')}`)
  })

  it('reads the quoted form, which is how a name with spaces is said', () => {
    expect(inline('ask @"Ada Lovelace" first')).toBe(
      `ask ${link('Ada Lovelace', 'Ada%20Lovelace')} first`,
    )
  })

  it('gives the sentence its full stop back', () => {
    expect(inline('thanks @wren.')).toBe(`thanks ${link('wren')}.`)
  })

  it('fires only at a boundary, so an e-mail address stays an address', () => {
    expect(inline('write to wren@example.com')).toBe('write to wren@example.com')
    expect(inline('(@wren)')).toBe(`(${link('wren')})`)
  })

  it('leaves a code span alone', () => {
    expect(inline('`@wren`')).toBe('<code class="md-code-span">@wren</code>')
  })

  it('honours an escape', () => {
    expect(inline('\\@wren')).toBe('@wren')
  })

  it('does not nest a mention inside a link label', () => {
    expect(inline('[hi @wren](https://example.com)')).toBe(
      '<a href="https://example.com" rel="nofollow ugc noopener noreferrer">hi @wren</a>',
    )
  })

  it('refuses a quoted form that is not a possible username', () => {
    expect(inline('@"a*b"')).toBe('@&quot;a*b&quot;')
  })

  it('refuses a run longer than any username can be', () => {
    const long = 'a'.repeat(65)
    expect(inline(`@${long}`)).toBe(`@${long}`)
  })

  it('is off in a signature, where the characters stay', () => {
    expect(renderMarkdown('hi @wren', { features: SIGNATURE_FEATURES }).html).toBe(
      '<p>hi @wren</p>',
    )
  })

  it('survives into plain text with its @, so an excerpt reads as addressed', () => {
    expect(plainText('thanks @wren')).toBe('thanks @wren')
  })
})

describe('extractMentions', () => {
  it('returns each name once, in first-appearance order', () => {
    expect(extractMentions('@ada then @wren then @ada again')).toEqual(['ada', 'wren'])
  })

  it('skips quotes and code, which the page does not read as this post speaking', () => {
    const source = [
      quoteBlock({ author: 'ada', markdown: 'ping @quoted-inside' }),
      '',
      'but @direct is spoken to',
      '',
      '```',
      '@in-code',
      '```',
    ].join('\n')
    expect(extractMentions(source)).toEqual(['direct'])
  })

  it('extracts nothing when the feature is off', () => {
    expect(extractMentions('hi @wren', { features: SIGNATURE_FEATURES })).toEqual([])
  })
})

describe('extractQuotedAuthors', () => {
  it('reads the attribution quoteBlock writes', () => {
    expect(extractQuotedAuthors(quoteBlock({ author: 'wren', markdown: 'hello' }))).toEqual([
      'wren',
    ])
  })

  it('reads every quote in a multiquote reply', () => {
    const source = [
      quoteBlock({ author: 'ada', markdown: 'one' }),
      '',
      quoteBlock({ author: 'wren', markdown: 'two' }),
      '',
      'my reply',
    ].join('\n')
    expect(extractQuotedAuthors(source)).toEqual(['ada', 'wren'])
  })

  it('still finds an attribution mid-paragraph, where stacked quotes lose their blank line', () => {
    const source = '> **ada wrote:**\n> one\n> **wren wrote:**\n> two'
    expect(extractQuotedAuthors(source)).toEqual(['ada', 'wren'])
  })

  it('leaves a nested quote to the conversation it already had', () => {
    const inner = quoteBlock({ author: 'inner', markdown: 'first' })
    const outer = quoteBlock({ author: 'outer', markdown: inner })
    expect(extractQuotedAuthors(outer)).toEqual(['outer'])
  })

  it('keeps an underscore, which is a legal username character', () => {
    expect(extractQuotedAuthors(quoteBlock({ author: 'wren_17', markdown: 'hi' }))).toEqual([
      'wren_17',
    ])
  })

  it('refuses an attribution the renderer reformatted, which no longer names anybody', () => {
    /* A member called `_foo_`: the underscores pair into emphasis, and the
       flattened text would attribute the quote to a different member, `foo`. */
    expect(extractQuotedAuthors('> **_foo_ wrote:**\n>\n> hi')).toEqual([])
  })

  it('does not read an unquoted strong line as an attribution', () => {
    expect(extractQuotedAuthors('**ada wrote:** something bold')).toEqual([])
  })
})
