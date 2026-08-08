/**
 * Mentions: the `@name` construct, and the two extractors the notification
 * producer runs over a stored body.
 */
import { describe, expect, it } from 'vitest'

import { renderMarkdown } from './body'
import { SIGNATURE_FEATURES } from './features'
import { extractMentions, extractQuotedAuthors, mentionHref } from './mention'
import { plainText } from './plain'
import { quoteBlock } from './quote'

describe('the @name construct', () => {
  it('renders a mention as a link to the member-by-name route', () => {
    expect(renderMarkdown('hello @ada').html).toBe(
      '<p>hello <a href="/member/by-name/ada" class="md-mention">@ada</a></p>',
    )
  })

  it('keeps the name as typed and percent-encodes the href', () => {
    const html = renderMarkdown('@Grüße_2.0').html
    expect(html).toContain('>@Grüße_2.0</a>')
    expect(html).toContain(`href="${mentionHref('Grüße_2.0')}"`)
  })

  it('does not read an e-mail address as a mention of its domain', () => {
    expect(renderMarkdown('mail me at ada@example.com').html).not.toContain('md-mention')
    expect(renderMarkdown('first.last@example.com').html).not.toContain('md-mention')
    expect(renderMarkdown('tag+filter@example.com').html).not.toContain('md-mention')
  })

  it('fires at a boundary, not in the middle of a word', () => {
    expect(renderMarkdown('(@ada)').html).toContain('md-mention')
    expect(renderMarkdown('*@ada*').html).toContain('md-mention')
    expect(renderMarkdown('@ada').html).toContain('md-mention')
  })

  it('gives a sentence-final full stop back to the sentence', () => {
    const html = renderMarkdown('thanks @ada.').html
    expect(html).toContain('>@ada</a>.')
  })

  it('keeps a dot that is inside the name', () => {
    expect(renderMarkdown('@ada.l fixed it').html).toContain('>@ada.l</a>')
  })

  it('leaves a lone @ and an escaped one as text', () => {
    expect(renderMarkdown('an @ sign').html).not.toContain('md-mention')
    expect(renderMarkdown('\\@ada').html).toBe('<p>@ada</p>')
  })

  it('never scans a code span', () => {
    expect(renderMarkdown('`git blame @ada`').html).not.toContain('md-mention')
  })

  it('never nests a mention inside a link', () => {
    const html = renderMarkdown('[ask @ada](https://example.com)').html
    expect(html).not.toContain('md-mention')
    expect(html.match(/<a /g)).toHaveLength(1)
  })

  it('is off in a signature, where it would be an address to nobody', () => {
    expect(renderMarkdown('@ada', { features: SIGNATURE_FEATURES }).html).toBe('<p>@ada</p>')
  })

  it('counts toward the words of a body', () => {
    expect(plainText('ask @ada about it')).toBe('ask @ada about it')
  })
})

describe('extractMentions', () => {
  it('reports names in order, deduplicated case-insensitively', () => {
    expect(extractMentions('@Ada then @bob then @ada again')).toEqual(['Ada', 'bob'])
  })

  it('reaches mentions in headings, lists and tables', () => {
    const source = '# for @ada\n\n- ping @bob\n\n| a |\n| - |\n| @carol |'
    expect(extractMentions(source)).toEqual(['ada', 'bob', 'carol'])
  })

  it('does not report a mention inside a quote — those are the quoted author\'s words', () => {
    const source = `${quoteBlock({ author: 'bob', markdown: 'ask @carol' })}\n\nI agree @dan`
    expect(extractMentions(source)).toEqual(['dan'])
  })

  it('does not report a mention inside a code block', () => {
    expect(extractMentions('```\n@ada\n```')).toEqual([])
  })
})

describe('extractQuotedAuthors', () => {
  it('reads the attribution quoteBlock writes', () => {
    const source = `${quoteBlock({ author: 'ada', markdown: 'the original post' })}\n\nwell said`
    expect(extractQuotedAuthors(source)).toEqual(['ada'])
  })

  it('reads every author of a multiquote', () => {
    const source = [
      quoteBlock({ author: 'ada', markdown: 'one' }),
      quoteBlock({ author: 'bob', markdown: 'two' }),
      'my reply',
    ].join('\n\n')
    expect(extractQuotedAuthors(source)).toEqual(['ada', 'bob'])
  })

  it('names only the author whose words were lifted, not who they quoted', () => {
    /* Quoting bob, whose post itself quoted carol: carol was told last time. */
    const bobsPost = `${quoteBlock({ author: 'carol', markdown: 'first' })}\n\nbob replying`
    const source = quoteBlock({ author: 'bob', markdown: bobsPost })
    expect(extractQuotedAuthors(source)).toEqual(['bob'])
  })

  it('attributes nobody for a bare quote or a plain bold line', () => {
    expect(extractQuotedAuthors(quoteBlock({ markdown: 'unattributed' }))).toEqual([])
    expect(extractQuotedAuthors('**ada wrote:** but not in a quote')).toEqual([])
    expect(extractQuotedAuthors('> just **bold words** in a quote')).toEqual([])
  })

  it('deduplicates two quotes of the same author', () => {
    const source = [
      quoteBlock({ author: 'ada', markdown: 'one' }),
      quoteBlock({ author: 'Ada', markdown: 'two' }),
    ].join('\n\n')
    expect(extractQuotedAuthors(source)).toEqual(['ada'])
  })
})
