import { describe, expect, it } from 'vitest'

import { renderMarkdown } from './body'

const html = (source: string): string => renderMarkdown(source).html

describe('quote attributions', () => {
  it('lifts the attribution out of the quoted text', () => {
    expect(html('> **ada wrote:**\n>\n> hello')).toBe(
      '<blockquote class="md-quote"><p class="md-quote-attribution">' +
        '<strong>ada wrote:</strong></p>\n<p>hello</p>\n</blockquote>',
    )
  })

  it('keeps the name a link when the quote gives it one', () => {
    const out = html('> **[ada](/member/by-name/ada) wrote:**\n>\n> hello')

    expect(out).toContain(
      '<strong><a class="md-quote-author" href="/member/by-name/ada" ' +
        'rel="nofollow ugc noopener noreferrer">ada</a> wrote:</strong>',
    )
  })

  it('uses the supplied attribution copy', () => {
    const out = renderMarkdown('> **ada wrote:**\n>\n> hello', {
      quoteAttribution: (author) => `quoted from ${author}`,
    }).html

    expect(out).toContain('<strong>quoted from ada</strong>')
  })

  it('marks the link back to the quoted post so a theme can place it', () => {
    const out = html('> **ada wrote:** [View post](/thread/15-release?post=90)\n>\n> hello')

    expect(out).toContain(
      '<a class="md-quote-source" href="/thread/15-release?post=90" ' +
        'rel="nofollow ugc noopener noreferrer">View post</a>',
    )
  })

  it('drops a link the renderer will not follow rather than emitting it', () => {
    const out = html('> **ada wrote:** [View post](javascript:alert(1))\n>\n> hello')

    expect(out).not.toContain('javascript:')
    expect(out).toContain('<strong>ada wrote:</strong>')
  })

  it('leaves a quote that opens with something else alone', () => {
    expect(html('> **ada wrote:** and then said more\n>\n> hello')).toContain(
      '<blockquote class="md-quote"><p><strong>ada wrote:</strong> and then said more</p>',
    )
    expect(html('> hello')).toBe('<blockquote class="md-quote"><p>hello</p>\n</blockquote>')
  })
})
