/**
 * The one-way door out of BBCode.
 *
 * Two properties matter more than the tag table, and both are tested here
 * rather than assumed:
 *
 *  1. **No words are lost.** A tag this build never had, an unclosed one, a
 *     `[code]` body full of other tags: each keeps its text.
 *  2. **No text is reinterpreted.** A BBCode post is not Markdown source, so
 *     everything Markdown would read as syntax is escaped on the way through.
 *     Without that, every post on a converted board containing `*` or
 *     `snake_case` changes meaning on the day of the upgrade.
 */
import { describe, expect, it } from 'vitest'

import { bbcodeToMarkdown } from './bbcode'
import { renderMarkdown } from './body'

/** What a converted post ends up showing, which is what actually matters. */
const shown = (source: string): string => renderMarkdown(bbcodeToMarkdown(source)).html

describe('the tags with a Markdown spelling', () => {
  it('converts the inline styling', () => {
    expect(bbcodeToMarkdown('[b]bold[/b] [i]it[/i] [s]gone[/s]')).toBe('**bold** *it* ~~gone~~')
  })

  it('converts both link forms and an image', () => {
    expect(bbcodeToMarkdown('[url=https://x.test]click[/url]')).toBe('[click](https://x.test)')
    expect(bbcodeToMarkdown('[url]https://x.test[/url]')).toBe('<https://x.test>')
    expect(bbcodeToMarkdown('[img]https://x.test/a.png[/img]')).toBe('![](https://x.test/a.png)')
    expect(bbcodeToMarkdown('[email]a@b.test[/email]')).toBe('<a@b.test>')
  })

  it('marks every line of a quote, blank ones included', () => {
    /*
     * A blockquote ends at the first line without a `>`. Without the marker on
     * the blank line, a two-paragraph quote would become one quoted paragraph
     * followed by the second one in nobody's voice.
     */
    expect(bbcodeToMarkdown('[quote=Bob]one\n\ntwo[/quote]')).toBe(
      '> **Bob wrote:**\n>\n> one\n>\n> two',
    )
  })

  it('reads MyBB’s quote attributes and drops the post id', () => {
    /* The id cannot become a link without the thread; F36 dropped it too. */
    expect(bbcodeToMarkdown("[quote='Bob' pid='42']x[/quote]")).toContain('**Bob wrote:**')
  })

  it('fences a code body long enough that its own backticks cannot close it', () => {
    const out = bbcodeToMarkdown('[code]a ``` b[/code]')
    expect(out.startsWith('````')).toBe(true)
    expect(shown('[code]a ``` b[/code]')).toContain('a ``` b')
  })

  it('does not read tags inside a code body', () => {
    expect(shown('[code][b]not bold[/b][/code]')).toContain('[b]not bold[/b]')
    expect(shown('[code][b]not bold[/b][/code]')).not.toContain('<strong>')
  })

  it('converts both kinds of list', () => {
    expect(bbcodeToMarkdown('[list][*]one[*]two[/list]')).toBe('- one\n- two')
    expect(bbcodeToMarkdown('[list=1][*]one[*]two[/list]')).toBe('1. one\n2. two')
  })
})

describe('the tags with no Markdown spelling', () => {
  it('keeps the words and drops the styling', () => {
    /*
     * `[u]`, `[color]` and `[size]` have no Markdown, and inventing a board-only
     * directive for each would be BBCode again under a different syntax. The
     * loss is recorded in `docs/mybb-parity.md`, where an operator will look for
     * it before promising anyone a like-for-like move.
     */
    expect(bbcodeToMarkdown('[u]under[/u] [color=red]red[/color] [size=5]big[/size]')).toBe(
      'under red big',
    )
  })
})

describe('what it refuses to reinterpret', () => {
  it('escapes the characters Markdown would read as syntax', () => {
    expect(shown('a * b and file_name and [not a tag]')).toBe(
      '<p>a * b and file_name and [not a tag]</p>',
    )
  })

  it('escapes a line that would have become a heading or a list', () => {
    expect(shown('# 1 fan\n- not a list')).toBe('<p># 1 fan<br>\n- not a list</p>')
  })

  it('keeps an unknown tag as the text it is', () => {
    expect(shown('[spoiler]hidden[/spoiler]')).toContain('[spoiler]hidden[/spoiler]')
  })

  it('keeps an unclosed tag as the text it is', () => {
    expect(shown('[b]unclosed')).toBe('<p>[b]unclosed</p>')
  })

  it('keeps a stray closing tag', () => {
    expect(shown('nothing opened[/b]')).toContain('nothing opened[/b]')
  })

  it('never throws, whatever the old board stored', () => {
    for (const source of ['[', '[]', '[/]', '[b'.repeat(500), '[quote='.repeat(200), '']) {
      expect(() => bbcodeToMarkdown(source)).not.toThrow()
    }
  })
})

describe('nesting', () => {
  it('converts a quote inside a quote', () => {
    const out = bbcodeToMarkdown('[quote=A]outer [quote=B]inner[/quote][/quote]')
    expect(shown('[quote=A]outer [quote=B]inner[/quote][/quote]')).toContain(
      '<blockquote class="md-quote"><p><strong>A wrote:</strong></p>',
    )
    expect(out).toContain('> > **B wrote:**')
  })

  it('converts styling inside a list item', () => {
    expect(bbcodeToMarkdown('[list][*][b]one[/b][/list]')).toBe('- **one**')
  })
})
