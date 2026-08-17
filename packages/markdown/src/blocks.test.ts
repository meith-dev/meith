import { describe, expect, it } from 'vitest'

import { parse } from './blocks'
import { renderMarkdown } from './body'
import { SIGNATURE_FEATURES } from './features'

const html = (source: string): string => renderMarkdown(source).html

describe('paragraphs and line breaks', () => {
  it('makes a single newline a line break, not a space', () => {
    expect(html('one\ntwo')).toBe('<p>one<br>\ntwo</p>')
  })

  it('separates paragraphs on a blank line', () => {
    expect(html('one\n\ntwo')).toBe('<p>one</p>\n<p>two</p>')
  })
})

describe('headings', () => {
  it('starts a post at h2, because the page already has an h1', () => {
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
    expect(html('```\na < b\n```')).toBe('<pre class="md-code"><code>a &lt; b\n</code></pre>')
  })

  it('names the language as a class rather than trusting the info string', () => {
    expect(html('```ts\nx\n```')).toContain('class="md-code-lang-ts"')
    expect(html('```<script>\nx\n```')).not.toContain('script')
  })

  it('closes an unclosed fence at the end of the post', () => {
    expect(html('```\nkept')).toContain('<pre class="md-code"><code>kept')
  })

  it('does not make an indented paragraph into code', () => {
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
    expect(html('- one\n- two')).toBe('<ul class="md-list"><li>one</li><li>two</li></ul>')
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

describe('the feature switches', () => {
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
