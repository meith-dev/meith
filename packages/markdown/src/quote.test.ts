import { describe, expect, it } from 'vitest'

import { renderMarkdown } from './body'
import { quoteBlock } from './quote'

describe('quoteBlock', () => {
  it('marks every line, including the blank ones', () => {
    expect(quoteBlock({ author: 'ada', markdown: 'one\n\ntwo' })).toBe(
      '> **ada wrote:**\n>\n> one\n>\n> two',
    )
  })

  it('keeps a two-paragraph quote inside one quote', () => {
    const html = renderMarkdown(quoteBlock({ author: 'ada', markdown: 'one\n\ntwo' })).html

    expect(html.match(/<blockquote/g)).toHaveLength(1)
    expect(html).not.toMatch(/<\/blockquote>\s*<p>two/)
  })

  it('quotes without an attribution when there is nobody to name', () => {
    expect(quoteBlock({ markdown: 'a passage' })).toBe('> a passage')
    expect(quoteBlock({ author: null, markdown: 'a passage' })).toBe('> a passage')
  })

  it('will not let a username reformat the attribution line', () => {
    expect(quoteBlock({ author: '**ada**_[x]`', markdown: 'x' })).toBe('> **adax wrote:**\n>\n> x')
  })

  it('quotes markup as the markup it is, because the source is already source', () => {
    expect(quoteBlock({ markdown: 'see [docs](https://x.test)' })).toBe(
      '> see [docs](https://x.test)',
    )
  })

  it('drops trailing whitespace rather than quoting empty lines after the text', () => {
    expect(quoteBlock({ markdown: 'text\n\n\n' })).toBe('> text')
  })
})
