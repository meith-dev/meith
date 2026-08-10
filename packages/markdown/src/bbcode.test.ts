import { describe, expect, it } from 'vitest'

import { bbcodeToMarkdown } from './bbcode'
import { renderMarkdown } from './body'

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
    expect(bbcodeToMarkdown('[quote=Bob]one\n\ntwo[/quote]')).toBe(
      '> **[Bob](/member/by-name/Bob) wrote:**\n>\n> one\n>\n> two',
    )
  })

  it('reads MyBB’s quote attributes and drops the post id', () => {
    expect(bbcodeToMarkdown("[quote='Bob' pid='42']x[/quote]")).toContain(
      '**[Bob](/member/by-name/Bob) wrote:**',
    )
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
      '<blockquote class="md-quote"><p class="md-quote-attribution"><strong>',
    )
    expect(out).toContain('> > **[B](/member/by-name/B) wrote:**')
  })

  it('converts styling inside a list item', () => {
    expect(bbcodeToMarkdown('[list][*][b]one[/b][/list]')).toBe('- **one**')
  })
})
