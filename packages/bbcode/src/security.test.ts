/**
 * F36 — the corpus, and the invariant it exists to defend.
 *
 * Every test in this file asserts the same property from a different angle:
 * **every `<` in the output is one this package wrote.** That is stronger than
 * "no `<script>` appears", which is the check that lets the next unlisted
 * vector through, and it is checkable mechanically against inputs nobody has
 * read — which is what makes the generated half of this file worth having.
 *
 * If the allowlist below needs a new entry, a tag was added. If a *test* needs a
 * new entry, something escaped.
 */
import { describe, expect, it } from 'vitest'

import { renderBBCode } from './body'
import { parse } from './parse'

/** The complete set of markup this package is allowed to emit. */
const EMITTED =
  /^<\/?(strong|em|u|s|br|span|a|img|blockquote|cite|pre|code|ul|ol|li)( [^<>]*)?>$/

/**
 * Assert that the output is nothing but our own tags and escaped text.
 *
 * Scans every `<` — after escaping, a text `<` is `&lt;`, so any that survives
 * must be the start of a tag we chose to write.
 */
function assertOnlyOurMarkup(html: string): void {
  for (let index = html.indexOf('<'); index !== -1; index = html.indexOf('<', index + 1)) {
    const end = html.indexOf('>', index)
    expect(end, `unterminated < in ${JSON.stringify(html)}`).toBeGreaterThan(index)
    const tag = html.slice(index, end + 1)
    expect(tag, `unexpected markup in ${JSON.stringify(html)}`).toMatch(EMITTED)
    expect(tag).not.toMatch(/\son[a-z]+\s*=/i)
    expect(tag).not.toMatch(/(href|src)\s*=\s*"(?!(https?:\/\/|mailto:|\/[^/]))/i)
  }
}

/**
 * Payloads chosen because each one defeats a *specific* naive implementation:
 * a blocklist, a single-pass regex replace, attribute escaping that forgets
 * quotes, a URL check that only looks at the start of the string, an HTML
 * sanitiser applied after the fact.
 */
const CORPUS: readonly string[] = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '[url=javascript:alert(1)]x[/url]',
  '[url=jAvAsCrIpT:alert(1)]x[/url]',
  '[url=java\tscript:alert(1)]x[/url]',
  '[url= javascript:alert(1)]x[/url]',
  '[url=https://a.example" onmouseover="alert(1)]x[/url]',
  "[url=https://a.example' onmouseover='alert(1)]x[/url]",
  '[url=data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==]x[/url]',
  '[img]javascript:alert(1)[/img]',
  '[img]https://a.example/x.png" onload="alert(1)[/img]',
  '[img]data:image/svg+xml,<svg onload=alert(1)>[/img]',
  '[color=red;background:url(javascript:alert(1))]x[/color]',
  '[color="><script>alert(1)</script>]x[/color]',
  '[size=1"><script>alert(1)</script>]x[/size]',
  "[quote='<img src=x onerror=alert(1)>']x[/quote]",
  '[quote=" onmouseover="alert(1)]x[/quote]',
  '[code]</code><script>alert(1)</script>[/code]',
  '[code][/code]<script>alert(1)</script>',
  '[b]<script>alert(1)</script>[/b]',
  '[url]https://a.example/</a><script>alert(1)</script>[/url]',
  '[email]x@a.example"><script>alert(1)</script>[/email]',
  '[list][*]<script>alert(1)</script>[/list]',
  '&lt;script&gt;alert(1)&lt;/script&gt;',
  '&#106;avascript:alert(1)',
  '[url=&#106;avascript:alert(1)]x[/url]',
  '[b][i][u][s]unbalanced[/b]',
  '[/b][/i][/quote][/code]',
  '[url=https://a.example]',
  '[quote=][/quote]',
  '[*][*][*]',
  '[list][list][list][*]a',
  '[code][code][code]a',
  '[b'.repeat(200),
  '[quote=' + '"'.repeat(200) + ']x[/quote]',
]

describe('rendering is safe by construction', () => {
  it.each(CORPUS)('neutralises %j', (source) => {
    const { html } = renderBBCode(source)
    assertOnlyOurMarkup(html)
    expect(html).not.toContain('<script')
    /*
     * Deliberately not `expect(html).not.toContain('javascript:')`. A rejected
     * `[url]` renders its target as *text*, so the word survives — and should:
     * the assertion that matters is that it never appears inside a tag, which
     * `assertOnlyOurMarkup` makes for every `href` and `src` above.
     */
    expect(html.replace(/<[^<>]*>/g, '')).not.toContain('<')
  })

  it('escapes rather than strips, so the payload is still readable as text', () => {
    expect(renderBBCode('<script>alert(1)</script>').html).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    )
  })

  it('does not decode entities, so &#106;avascript: cannot become a scheme', () => {
    const { html } = renderBBCode('[url=&#106;avascript:alert(1)]x[/url]')
    expect(html).toBe('x')
  })
})

/**
 * A seeded generator, not `Math.random()`.
 *
 * A fuzz test that cannot reproduce its own failure is a flake generator: CI
 * goes red on input nobody can see, the run is retried, and the finding is
 * gone. The seed is fixed, so a failure here reproduces on any machine, and
 * widening the search means changing the seed deliberately.
 */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

/** Fragments picked so the generator produces near-misses, not random noise. */
const FRAGMENTS: readonly string[] = [
  '[b]', '[/b]', '[i]', '[/i]', '[u]', '[/u]', '[s]', '[/s]',
  '[url]', '[url=', '[/url]', '[img]', '[/img]', '[email]', '[/email]',
  '[quote]', "[quote='a' pid='1']", '[/quote]', '[code]', '[/code]',
  '[list]', '[list=1]', '[/list]', '[*]', '[color=red]', '[/color]',
  '[size=4]', '[/size]', '[unknown]', '[/unknown]',
  '[', ']', '=', "'", '"', '/', '\\', '<', '>', '&', ';', ':', '\n', ' ',
  'https://a.example/x', 'javascript:alert(1)', 'data:text/html,x',
  'onerror', 'script', 'style', 'text', 'İ', ' ',
]

describe('fuzzing', () => {
  it('never throws, and never emits markup it did not write', () => {
    const random = seededRandom(0x5f36c0de)

    for (let iteration = 0; iteration < 4_000; iteration += 1) {
      const length = 1 + Math.floor(random() * 24)
      let source = ''
      for (let part = 0; part < length; part += 1) {
        source += FRAGMENTS[Math.floor(random() * FRAGMENTS.length)]!
      }

      let html: string
      try {
        html = renderBBCode(source).html
      } catch (error) {
        throw new Error(`render threw on ${JSON.stringify(source)}`, { cause: error })
      }
      assertOnlyOurMarkup(html)
    }
  })

  it('keeps every word the author typed, whatever the markup around it does', () => {
    const random = seededRandom(0x1234abcd)

    for (let iteration = 0; iteration < 1_000; iteration += 1) {
      const marker = `w${iteration}`
      const parts: string[] = []
      const length = 1 + Math.floor(random() * 12)
      for (let part = 0; part < length; part += 1) {
        parts.push(FRAGMENTS[Math.floor(random() * FRAGMENTS.length)]!)
      }
      const at = Math.floor(random() * (parts.length + 1))
      parts.splice(at, 0, marker)

      const { html } = renderBBCode(parts.join(''))
      expect(html, `lost ${marker} from ${JSON.stringify(parts.join(''))}`).toContain(marker)
    }
  })

  it('bounds the tree regardless of how nested the input is', () => {
    const document = parse('[b][quote][list][*]'.repeat(500))
    let depth = 0
    const measure = (nodes: readonly ReturnType<typeof parse>['nodes'][number][], level: number): void => {
      depth = Math.max(depth, level)
      for (const node of nodes) {
        if (node.kind === 'element') measure(node.children, level + 1)
      }
    }
    measure(document.nodes, 0)
    expect(depth).toBeLessThanOrEqual(12)
  })
})
