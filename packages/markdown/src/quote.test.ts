import { describe, expect, it } from 'vitest'

import { renderMarkdown } from './body'
import { quoteBlock } from './quote'

describe('quoteBlock', () => {
  it('marks every line, including the blank ones', () => {
    expect(quoteBlock({ author: 'ada', markdown: 'one\n\ntwo' })).toBe(
      '> **[ada](/member/by-name/ada) wrote:**\n>\n> one\n>\n> two',
    )
  })

  it('keeps a two-paragraph quote inside one quote', () => {
    const html = renderMarkdown(quoteBlock({ author: 'ada', markdown: 'one\n\ntwo' })).html

    expect(html.match(/<blockquote/g)).toHaveLength(1)
    expect(html).not.toMatch(/<\/blockquote>\s*<p>two/)
  })

  it('links the name at the profile a mention of it would reach', () => {
    const html = renderMarkdown(quoteBlock({ author: 'ada', markdown: 'x' })).html

    expect(html).toContain('<a class="md-quote-author" href="/member/by-name/ada"')
    expect(html).toContain('>ada</a> wrote:</strong>')
  })

  it('leaves the name unlinked when the caller says there is nowhere to point', () => {
    expect(quoteBlock({ author: 'ada', authorHref: null, markdown: 'x' })).toBe(
      '> **ada wrote:**\n>\n> x',
    )
  })

  it('escapes a name that would otherwise close the link it is written into', () => {
    expect(quoteBlock({ author: 'ada (x)', markdown: 'x' })).toBe(
      '> **[ada (x)](/member/by-name/ada%20%28x%29) wrote:**\n>\n> x',
    )
  })

  it('carries a link back to what was quoted', () => {
    const source = quoteBlock({
      author: 'ada',
      sourceHref: '/thread/15-release?post=90',
      markdown: 'x',
    })

    expect(source).toBe(
      '> **[ada](/member/by-name/ada) wrote:** [View post](/thread/15-release?post=90)\n>\n> x',
    )

    const html = renderMarkdown(source).html
    expect(html).toContain('<a class="md-quote-source" href="/thread/15-release?post=90"')
    expect(html).toContain('>View post</a></p>')
  })

  it('takes a label for a quote of something that is not a post', () => {
    expect(
      quoteBlock({ author: 'ada', sourceHref: '/messages/4', sourceLabel: 'View message', markdown: 'x' }),
    ).toContain('[View message](/messages/4)')
  })

  it('quotes without an attribution when there is nobody to name', () => {
    expect(quoteBlock({ markdown: 'a passage' })).toBe('> a passage')
    expect(quoteBlock({ author: null, markdown: 'a passage' })).toBe('> a passage')
  })

  it('will not let a username reformat the attribution line', () => {
    expect(quoteBlock({ author: '**ada**_[x]`', authorHref: null, markdown: 'x' })).toBe(
      '> **ada_x wrote:**\n>\n> x',
    )
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
