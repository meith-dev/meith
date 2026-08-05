/**
 * The quote block, and the one rule it exists to hold: a blockquote ends at the
 * first line without a `>`.
 */
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
    /*
     * The whole reason this is a function rather than four template literals.
     * Without the marker on the blank line, the second paragraph renders in the
     * replier's own voice, under the quoted author's name.
     */
    const html = renderMarkdown(quoteBlock({ author: 'ada', markdown: 'one\n\ntwo' })).html

    expect(html.match(/<blockquote/g)).toHaveLength(1)
    expect(html).not.toMatch(/<\/blockquote>\s*<p>two/)
  })

  it('quotes without an attribution when there is nobody to name', () => {
    expect(quoteBlock({ markdown: 'a passage' })).toBe('> a passage')
    expect(quoteBlock({ author: null, markdown: 'a passage' })).toBe('> a passage')
  })

  it('will not let a username reformat the attribution line', () => {
    /*
     * The renderer escapes what it produces, but the *source* is what the
     * replier then edits — a name carrying `**` would close the bold early and
     * stay broken in whatever they post.
     */
    expect(quoteBlock({ author: '**ada**_[x]`', markdown: 'x' })).toBe('> **adax wrote:**\n>\n> x')
  })

  it('quotes markup as the markup it is, because the source is already source', () => {
    /* A quote of a post containing a link is a quote containing that link. */
    expect(quoteBlock({ markdown: 'see [docs](https://x.test)' })).toBe(
      '> see [docs](https://x.test)',
    )
  })

  it('drops trailing whitespace rather than quoting empty lines after the text', () => {
    expect(quoteBlock({ markdown: 'text\n\n\n' })).toBe('> text')
  })
})
