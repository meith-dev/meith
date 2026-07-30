/** F36 — what each tag actually emits. */
import { describe, expect, it } from 'vitest'

import { renderBBCode } from './body'

const html = (source: string): string => renderBBCode(source).html

describe('render', () => {
  it('escapes text', () => {
    expect(html('a < b & c > d "e" \'f\'')).toBe(
      'a &lt; b &amp; c &gt; d &quot;e&quot; &#39;f&#39;',
    )
  })

  it('turns newlines into breaks', () => {
    expect(html('one\ntwo')).toBe('one<br>\ntwo')
  })

  describe('inline tags', () => {
    it('renders the four basics semantically', () => {
      expect(html('[b]a[/b][i]b[/i][u]c[/u][s]d[/s]')).toBe(
        '<strong>a</strong><em>b</em><u>c</u><s>d</s>',
      )
    })

    it('accepts a colour keyword or hex', () => {
      expect(html('[color=red]a[/color]')).toBe('<span style="color:red">a</span>')
      expect(html('[color=#ff8800]a[/color]')).toBe('<span style="color:#ff8800">a</span>')
    })

    /*
     * The value lands inside a `style` attribute, so this is the one attribute
     * in the package where escaping alone would not be enough — `;` would open a
     * second declaration. The pattern admits no punctuation at all, and these
     * are the shapes that would exploit it if it did.
     */
    it('drops a colour that is not a colour, keeping the text', () => {
      for (const attempt of [
        'red;background:url(https://evil.example/x)',
        'expression(alert(1))',
        'var(--token)',
        '#12',
        'rgb(1,2,3)',
      ]) {
        expect(html(`[color=${attempt}]a[/color]`)).toBe('a')
      }
    })

    it('maps sizes to classes, not lengths', () => {
      expect(html('[size=3]a[/size]')).toBe('<span class="bb-size-3">a</span>')
      expect(html('[size=9]a[/size]')).toBe('a')
      expect(html('[size=3px]a[/size]')).toBe('a')
    })
  })

  describe('links', () => {
    it('links a bare url', () => {
      expect(html('[url]https://example.com/a[/url]')).toBe(
        '<a href="https://example.com/a" rel="nofollow ugc noopener noreferrer">https://example.com/a</a>',
      )
    })

    it('links a labelled url and renders the label as markup', () => {
      expect(html('[url=https://example.com][b]site[/b][/url]')).toBe(
        '<a href="https://example.com" rel="nofollow ugc noopener noreferrer"><strong>site</strong></a>',
      )
    })

    it('links a board-relative path', () => {
      expect(html('[url=/thread/4-hello]there[/url]')).toBe(
        '<a href="/thread/4-hello" rel="nofollow ugc noopener noreferrer">there</a>',
      )
    })

    it('keeps the text but drops the link when the target is not allowed', () => {
      for (const target of [
        'javascript:alert(1)',
        'JaVaScRiPt:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        'vbscript:msgbox(1)',
        '//evil.example/path',
        'ftp://files.example/x',
        'mailto:someone@example.com',
      ]) {
        expect(html(`[url=${target}]click[/url]`)).toBe('click')
      }
    })

    it('renders an email address only through [email]', () => {
      expect(html('[email]someone@example.com[/email]')).toBe(
        '<a href="mailto:someone@example.com" rel="nofollow ugc noopener noreferrer">someone@example.com</a>',
      )
      expect(html('[email]not an address[/email]')).toBe('not an address')
    })

    it('renders an image with empty alt text', () => {
      expect(html('[img]https://example.com/a.png[/img]')).toBe(
        '<img src="https://example.com/a.png" alt="" loading="lazy" class="bb-image">',
      )
    })

    it('refuses a data-url image, which is a script context in disguise', () => {
      expect(html('[img]data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=[/img]')).toBe(
        'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
      )
    })
  })

  describe('blocks', () => {
    it('renders an attributed quote with its author', () => {
      expect(html("[quote='Ada' pid='42']hello[/quote]")).toBe(
        '<blockquote class="bb-quote"><cite class="bb-quote-author">Ada wrote:</cite>hello</blockquote>',
      )
    })

    it('renders a bare quote without a citation', () => {
      expect(html('[quote]hello[/quote]')).toBe(
        '<blockquote class="bb-quote">hello</blockquote>',
      )
    })

    it('escapes a quoted author, who chose their own name', () => {
      expect(html("[quote='<script>']x[/quote]")).toContain(
        '<cite class="bb-quote-author">&lt;script&gt; wrote:</cite>',
      )
    })

    it('renders code verbatim, without breaks and without parsing it', () => {
      expect(html('[code]\nif (a < b) {\n  [b]x[/b]\n}\n[/code]')).toBe(
        '<pre class="bb-code"><code>if (a &lt; b) {\n  [b]x[/b]\n}\n</code></pre>',
      )
    })

    it('renders both list flavours', () => {
      expect(html('[list][*]a[*]b[/list]')).toBe(
        '<ul class="bb-list"><li>a</li><li>b</li></ul>',
      )
      expect(html('[list=1][*]a[/list]')).toBe('<ol class="bb-list"><li>a</li></ol>')
      expect(html('[list=a][*]a[/list]')).toBe(
        '<ol class="bb-list bb-list-a"><li>a</li></ol>',
      )
    })

    /*
     * A blockquote already ends its line, so the newline the author typed after
     * `[/quote]` would otherwise render as a leading blank line. Exactly one is
     * absorbed, which is why the second example keeps its blank line.
     */
    it('absorbs one newline either side of a block', () => {
      expect(html('[quote]q[/quote]\nafter')).toBe(
        '<blockquote class="bb-quote">q</blockquote>after',
      )
      expect(html('[quote]q[/quote]\n\nafter')).toBe(
        '<blockquote class="bb-quote">q</blockquote><br>\nafter',
      )
    })
  })

  it('renders a demoted tag as the text it looks like', () => {
    expect(html('[b]bold')).toBe('[b]bold')
  })

  it('renders a whole realistic post', () => {
    const source = [
      "[quote='Ada' pid='7']Is [b]this[/b] documented?[/quote]",
      'Yes — see [url=/thread/9-docs]the docs thread[/url].',
      '[list]',
      '[*]first',
      '[*]second',
      '[/list]',
      '[code]pnpm verify[/code]',
    ].join('\n')

    expect(html(source)).toBe(
      '<blockquote class="bb-quote"><cite class="bb-quote-author">Ada wrote:</cite>' +
        'Is <strong>this</strong> documented?</blockquote>' +
        'Yes — see <a href="/thread/9-docs" rel="nofollow ugc noopener noreferrer">' +
        'the docs thread</a>.' +
        '<ul class="bb-list"><li>first<br>\n</li><li>second<br>\n</li></ul>' +
        '<pre class="bb-code"><code>pnpm verify</code></pre>',
    )
  })
})
