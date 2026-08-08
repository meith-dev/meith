/**
 * The block grammar, and the three places this Markdown is deliberately not
 * CommonMark. Each of those has a test naming the decision, because a deviation
 * nobody wrote down is a bug report waiting to be filed.
 */
import { describe, expect, it } from 'vitest'

import { SIGNATURE_FEATURES } from './features'
import { renderMarkdown } from './body'
import { parse } from './blocks'

const html = (source: string): string => renderMarkdown(source).html

describe('paragraphs and line breaks', () => {
  it('makes a single newline a line break, not a space', () => {
    /*
     * CommonMark folds a soft break into a space. That is right for documents
     * and wrong for a message box: people write addresses and set lists in
     * posts and press Return where they mean it. Every forum-flavoured Markdown
     * ever shipped has made this same change.
     */
    expect(html('one\ntwo')).toBe('<p>one<br>\ntwo</p>')
  })

  it('separates paragraphs on a blank line', () => {
    expect(html('one\n\ntwo')).toBe('<p>one</p>\n<p>two</p>')
  })
})

describe('headings', () => {
  it('starts a post at h2, because the page already has an h1', () => {
    /*
     * A post that could emit an `<h1>` would break the outline a screen-reader
     * user navigates the thread by — the thread's subject is the page's only
     * first-level heading.
     */
    expect(html('# Top')).toBe('<h2>Top</h2>')
    expect(html('## Second')).toBe('<h3>Second</h3>')
  })

  it('stops at h6, which is as deep as HTML goes', () => {
    expect(html('###### Deep')).toBe('<h6>Deep</h6>')
  })

  it('reads the underlined form, which is what a `---` under a line means', () => {
    expect(html('Title\n===')).toBe('<h2>Title</h2>')
    expect(html('Title\n---')).toBe('<h3>Title</h3>')
  })
})

describe('code', () => {
  it('escapes a fenced body and keeps its newlines', () => {
    expect(html('```\na < b\n```')).toBe(
      '<pre class="md-code"><code>a &lt; b\n</code></pre>',
    )
  })

  it('names the language as a class rather than trusting the info string', () => {
    expect(html('```ts\nx\n```')).toContain('class="md-code-lang-ts"')
    expect(html('```<script>\nx\n```')).not.toContain('script')
  })

  it('closes an unclosed fence at the end of the post', () => {
    /*
     * The alternative — treating an unclosed fence as text — takes a post whose
     * author forgot three backticks and renders the code they were quoting as
     * formatting. That is the worse of the two failures.
     */
    expect(html('```\nkept')).toContain('<pre class="md-code"><code>kept')
  })

  it('does not make an indented paragraph into code', () => {
    /*
     * The single most common "Markdown ate my post" complaint, and the reason
     * indented code blocks are not implemented: four spaces is what a pasted,
     * wrapped or hand-aligned paragraph looks like.
     */
    expect(html('    just indented text')).toBe('<p>just indented text</p>')
  })
})

describe('quotes', () => {
  it('nests, which is the shape of a forum argument', () => {
    expect(html('> a\n> > b')).toContain('<blockquote class="md-quote"><p>a</p>')
    expect(html('> a\n> > b')).toContain('<blockquote class="md-quote"><p>b</p>')
  })

  it('takes a wrapped line with it, because that is what editors produce', () => {
    expect(html('> quoted\ncontinued')).toBe(
      '<blockquote class="md-quote"><p>quoted<br>\ncontinued</p>\n</blockquote>',
    )
  })

  it('ends at a blank line', () => {
    const out = html('> quoted\n\nnot quoted')
    expect(out).toContain('</blockquote>')
    expect(out).toContain('<p>not quoted</p>')
  })
})

describe('lists', () => {
  it('renders a tight list without paragraphs inside its items', () => {
    expect(html('- one\n- two')).toBe(
      '<ul class="md-list"><li>one</li><li>two</li></ul>',
    )
  })

  it('renders a loose list with them, because the author left the blank line', () => {
    expect(html('- one\n\n- two')).toContain('<li><p>one</p>')
  })

  it('nests on indentation', () => {
    expect(html('- one\n  - inner')).toContain('<li>one<ul class="md-list"><li>inner</li></ul>')
  })

  it('keeps an ordered list’s starting number', () => {
    expect(html('3. three\n4. four')).toContain('<ol class="md-list" start="3">')
  })

  it('starts a new list when the marker changes', () => {
    const out = html('- one\n* two')
    expect(out.match(/<ul/g)).toHaveLength(2)
  })

  it('renders a task item as a checkbox nobody can tick', () => {
    /*
     * `disabled`, always: a checkbox a reader could change would be a control
     * that persists nowhere, on a page of somebody else's post.
     */
    expect(html('- [x] done')).toContain('<input type="checkbox" disabled checked>')
    expect(html('- [ ] todo')).toContain('<input type="checkbox" disabled>')
  })
})

describe('tables', () => {
  it('reads alignment from the delimiter row', () => {
    const out = html('| a | b |\n| :-- | --: |\n| 1 | 2 |')
    expect(out).toContain('<th class="md-align-left">a</th>')
    expect(out).toContain('<td class="md-align-right">2</td>')
  })

  it('pads a short row rather than refusing the table', () => {
    /*
     * GFM's rule, and the humane one: somebody who miscounted a pipe gets their
     * table, not a paragraph full of them.
     */
    expect(html('| a | b |\n|---|---|\n| 1 |')).toContain('<td></td>')
  })

  it('wraps it in its own scroller, so a wide table never widens the thread', () => {
    expect(html('| a |\n|---|\n| 1 |')).toContain('<div class="md-table-scroll">')
  })

  it('leaves a lone pipe alone', () => {
    expect(html('a | b')).toBe('<p>a | b</p>')
  })
})

describe('limits', () => {
  it('keeps the tail of an over-long body as text rather than dropping it', () => {
    const source = `${'x'.repeat(40)}\n\n**bold**`
    const { html: out, truncated } = renderMarkdown(source, { limits: { maxInput: 20 } })

    expect(truncated).toBe(true)
    /* Every character is still on the page; only some of it stopped formatting. */
    expect(out).toContain('**bold**')
  })

  it('refuses to nest past the ceiling, and keeps the markers as text', () => {
    const deep = `${'> '.repeat(30)}deep`
    const out = renderMarkdown(deep, { limits: { maxDepth: 3 } })

    expect(out.html).toContain('deep')
    expect(out.html).not.toContain('&gt;&gt;')
  })

  it('stops formatting when the node budget runs out, and keeps the words', () => {
    const source = Array.from({ length: 200 }, (_unused, index) => `para ${index}`).join('\n\n')
    const out = renderMarkdown(source, { limits: { maxNodes: 10 } })

    expect(out.truncated).toBe(true)
    expect(out.html).toContain('para 199')
  })

  it('never throws, whatever it is handed', () => {
    for (const source of ['[', '](', '```', '> > > >', '***', '|||', ':::', '- '.repeat(500)]) {
      expect(() => renderMarkdown(source)).not.toThrow()
    }
  })
})

describe('the feature switches (F58)', () => {
  const signature = (source: string): string =>
    renderMarkdown(source, { features: SIGNATURE_FEATURES }).html

  it('leaves a disabled block construct as the characters somebody typed', () => {
    expect(signature('# Shouting')).toBe('<p># Shouting</p>')
    expect(signature('> quoted')).toBe('<p>&gt; quoted</p>')
  })

  it('keeps the inline styling a signature is for', () => {
    expect(signature('**bold** and [a link](https://x.test)')).toContain('<strong>bold</strong>')
    expect(signature('**bold** and [a link](https://x.test)')).toContain('href="https://x.test"')
  })

  it('keeps an image’s words and drops the image', () => {
    const out = signature('![a photo](https://x.test/a.png)')
    expect(out).not.toContain('<img')
    expect(out).toContain('a photo')
  })
})

describe('the parsed document', () => {
  it('reports the block kinds a caller can walk', () => {
    const document = parse('# H\n\ntext\n\n- item')
    expect(document.blocks.map((block) => block.kind)).toEqual(['heading', 'paragraph', 'list'])
  })
})
