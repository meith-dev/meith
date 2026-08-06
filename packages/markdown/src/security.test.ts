import { describe, expect, it } from 'vitest'

import { renderMarkdown } from './body'
import { compileVocabulary } from './vocabulary'
import { vocabularyOptions } from './body'

const html = (source: string): string => renderMarkdown(source).html

describe('HTML in a post is text', () => {
  it('does not pass an HTML block through, whatever CommonMark says', () => {
    expect(html('<script>alert(1)</script>')).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>')
    expect(html('<div onclick="x">hi</div>')).not.toContain('<div')
  })

  it('escapes inline HTML too, including a lone angle bracket', () => {
    expect(html('a < b and c > d')).toBe('<p>a &lt; b and c &gt; d</p>')
    expect(html('<img src=x onerror=alert(1)>')).not.toContain('<img')
  })

  it('escapes inside a code span and a fenced block', () => {
    expect(html('`<b>`')).toContain('&lt;b&gt;')
    expect(html('```\n<b>\n```')).toContain('&lt;b&gt;')
  })

  it('escapes an HTML comment rather than letting it hide markup', () => {
    expect(html('<!-- <script>alert(1)</script> -->')).not.toContain('<script')
  })
})

describe('what may become an href', () => {
  it('drops a `javascript:` destination and keeps the words', () => {
    const out = html('[click](javascript:alert(1))')
    expect(out).not.toContain('javascript')
    expect(out).toContain('click')
  })

  it('drops every spelling of it, because the rule is an allowlist', () => {
    for (const scheme of [
      'JaVaScRiPt:alert(1)',
      'java\u0009script:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox',
      'javascript:alert(1)',
    ]) {
      expect(html(`[x](${scheme})`)).not.toContain('href=')
    }
  })

  it('refuses a protocol-relative URL, which is another origin wearing a path', () => {
    expect(html('[x](//evil.example/a)')).not.toContain('href=')
    expect(html('[x](/\\evil.example)')).not.toContain('href=')
  })

  it('allows the three things a post legitimately links to', () => {
    expect(html('[x](https://ok.example/a)')).toContain('href="https://ok.example/a"')
    expect(html('[x](/forum/1-general)')).toContain('href="/forum/1-general"')
    expect(html('[x](mailto:a@b.example)')).toContain('href="mailto:a@b.example"')
  })

  it('escapes a quote in a destination that did pass, so it cannot leave the attribute', () => {
    const out = html('[x](https://ok.example/a"onmouseover="alert(1))')
    expect(out).not.toContain('onmouseover="alert')
  })

  it('marks every member link nofollow ugc noopener noreferrer', () => {
    expect(html('[x](https://ok.example)')).toContain(
      'rel="nofollow ugc noopener noreferrer"',
    )
  })

  it('refuses a data: image, which is a script context in some browsers', () => {
    expect(html('![x](data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=)')).not.toContain('<img')
  })
})

describe('attributes the renderer builds itself', () => {
  it('escapes a title', () => {
    expect(html('[x](https://ok.example "a \\" b")')).not.toMatch(/title="a " b"/)
  })

  it('escapes an image’s alt text, so it cannot close the attribute', () => {
    const out = html('![" onerror="alert(1)](https://ok.example/a.png)')
    expect(out).toContain('alt="&quot; onerror=&quot;alert(1)"')
    expect(out).not.toContain('" onerror="alert(1)"')
  })

  it('will not take a language class from an info string that is not one', () => {
    expect(html('```" onload="alert(1)\nx\n```')).not.toContain('onload')
  })
})

describe('the board vocabulary cannot introduce markup', () => {
  it('renders a directive as a class, never as the name’s own markup', () => {
    const vocabulary = compileVocabulary({
      revision: 1,
      smilies: [],
      directives: [{ name: 'spoiler', block: false }],
    })

    const out = renderMarkdown(':spoiler[the ending]', vocabularyOptions(vocabulary)).html
    expect(out).toContain('<span class="md-directive md-directive-spoiler">the ending</span>')
  })

  it('drops a smiley whose URL would not be allowed, instead of failing the page', () => {
    const vocabulary = compileVocabulary({
      revision: 1,
      smilies: [{ code: ':evil:', src: 'javascript:alert(1)' }],
      directives: [],
    })

    expect(vocabulary.smilies).toBeUndefined()
    expect(vocabulary.rejected).toHaveLength(1)
  })

  it('does not expand a smiley inside code, because it works on the tree', () => {
    const vocabulary = compileVocabulary({
      revision: 1,
      smilies: [{ code: ':)', src: '/smile.png' }],
      directives: [],
    })
    const out = renderMarkdown('`:)` and :)', vocabularyOptions(vocabulary)).html

    expect(out).toContain('<code class="md-code-span">:)</code>')
    expect(out).toContain('<img src="/smile.png"')
  })
})
