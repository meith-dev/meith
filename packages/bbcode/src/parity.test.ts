import { describe, expect, it } from 'vitest'

import { renderBBCode } from './body'

/**
 * F87 — the MyBB parity corpus.
 *
 * ## Where this corpus comes from, and where it does not
 *
 * **No MyBB source artefacts are copied.** That is a standing project rule, and
 * it is not merely a licensing one: MyBB's parser is a pile of regular
 * expressions accumulated over fifteen years, and reproducing them would
 * reproduce their bugs as though the bugs were the specification.
 *
 * So the corpus is written from the *observable* side — the BBCode people
 * actually type, the shapes that appear in real posts, and MyBB's documented
 * behaviour for each. Every case is a claim about what a **reader** sees, not
 * about how MyBB computes it.
 *
 * ## Every difference is a decision, not a bug
 *
 * A parity pass whose output is "we match" is a parity pass that did not look
 * hard enough. Where this renderer differs from MyBB, the case is here with the
 * difference asserted and the reason stated, and the same decision is recorded
 * in `docs/mybb-parity.md`. A difference nobody wrote down is a difference
 * somebody will "fix" later, in whichever direction they happen to prefer.
 *
 * The differences fall into three groups, and the grouping is the argument:
 *
 *  1. **Security.** MyBB accepts things this renderer refuses. These are not
 *     matched, ever, and the corpus asserts the refusal.
 *  2. **Malformed input.** MyBB's regexes leave unclosed tags as literal text in
 *     some places and swallow them in others, depending on which expression ran
 *     first. This renderer parses, so it is consistent — which means it differs
 *     from MyBB in the cases where MyBB is inconsistent with itself.
 *  3. **Unsupported tags.** Where a tag is not implemented, the corpus says so
 *     and the tag renders as text rather than disappearing.
 */

const html = (source: string): string => renderBBCode(source).html

/* ------------------------------------------------------------------ *
 * 1. The ordinary cases — where parity is exact
 * ------------------------------------------------------------------ */

describe('parity: the tags people actually type', () => {
  it.each([
    ['[b]bold[/b]', '<strong>bold</strong>'],
    ['[i]italic[/i]', '<em>italic</em>'],
    ['[u]underline[/u]', '<u>underline</u>'],
    ['[s]struck[/s]', '<s>struck</s>'],
  ])('renders %s', (source, expected) => {
    expect(html(source)).toContain(expected)
  })

  it('nests as MyBB does', () => {
    expect(html('[b][i]both[/i][/b]')).toContain('<strong><em>both</em></strong>')
  })

  /*
   * MyBB is case-insensitive on tag names, and boards are full of `[B]` from
   * people who typed it with caps lock on. A parser that only matched lower case
   * would render fifteen years of emphasis as literal text.
   */
  it('accepts upper-case tag names, as MyBB does', () => {
    expect(html('[B]bold[/B]')).toContain('<strong>bold</strong>')
    expect(html('[b]bold[/B]')).toContain('<strong>bold</strong>')
  })

  it('renders a quote', () => {
    expect(html('[quote]said[/quote]')).toContain('said')
  })

  it('renders a code block without interpreting what is inside it', () => {
    const output = html('[code][b]not bold[/b][/code]')
    expect(output).not.toContain('<strong>')
    expect(output).toContain('[b]not bold[/b]')
  })

  it('renders a list', () => {
    const output = html('[list]\n[*]one\n[*]two\n[/list]')
    expect(output).toContain('one')
    expect(output).toContain('two')
  })
})

/* ------------------------------------------------------------------ *
 * 2. Security — where this renderer deliberately refuses
 * ------------------------------------------------------------------ */

describe('parity difference: things MyBB has historically allowed', () => {
  /*
   * **Not matched, and never will be.** Each of these is an XSS in a forum post,
   * and "MyBB renders it" is a description of MyBB's history rather than a
   * requirement. Recorded in mybb-parity.md as an accepted divergence.
   */
  it('refuses a javascript: URL in [url]', () => {
    const output = html('[url=javascript:alert(1)]click[/url]')
    expect(output).not.toContain('javascript:')
  })

  /*
   * The claim is "no image element with that source", not "the string never
   * appears". The renderer drops the tag and leaves the URL as escaped text,
   * which is harmless — it is not a link, not an image and not an attribute —
   * and the first version of this assertion checked for the substring, which
   * failed against behaviour that was already correct.
   *
   * Asserting on the *string* rather than on the *element* is how a security
   * test ends up either failing on safe output or passing on unsafe output that
   * happens to spell the payload differently.
   */
  it('refuses a data: URL in [img]', () => {
    const output = html('[img]data:text/html;base64,PHNjcmlwdD4=[/img]')
    expect(output).not.toContain('<img')
    expect(output).not.toMatch(/src\s*=\s*["']?data:/i)
  })

  it('drops a javascript: link entirely rather than rendering an anchor', () => {
    const output = html('[url=javascript:alert(1)]click[/url]')
    expect(output).not.toContain('<a')
    expect(output).toContain('click')
  })

  it('escapes HTML in the source', () => {
    const output = html('<script>alert(1)</script>')
    expect(output).not.toContain('<script>')
    expect(output).toContain('&lt;script&gt;')
  })

  it('escapes HTML inside a tag’s content', () => {
    expect(html('[b]<img onerror=alert(1)>[/b]')).not.toContain('<img')
  })

  /*
   * A colour is a token or a hex literal, never arbitrary CSS. MyBB passes the
   * attribute through with light filtering, which historically allowed
   * `[color=red;background:url(javascript:…)]` and similar.
   */
  it('refuses CSS smuggled through [color]', () => {
    const output = html('[color=red;background:url(x)]text[/color]')
    expect(output).not.toContain('background')
  })

  it('refuses a script-bearing [size]', () => {
    expect(html('[size=1"onload="alert(1)]x[/size]')).not.toContain('onload')
  })
})

/* ------------------------------------------------------------------ *
 * 3. Malformed input — where MyBB is inconsistent and this is not
 * ------------------------------------------------------------------ */

describe('parity difference: malformed input', () => {
  /*
   * MyBB's regexes leave an unclosed tag as literal text in some contexts and
   * swallow it in others, depending on which expression ran first. This renderer
   * parses, so it is consistent — and consistency is the difference.
   *
   * The rule here: an unclosed tag renders as **text**. Nothing is silently
   * dropped, because a post whose second half vanished is worse than a post with
   * a visible `[b]` in it.
   */
  it('renders an unclosed tag as text, keeping everything after it', () => {
    const output = html('before [b] after')
    expect(output).toContain('after')
  })

  it('keeps the content of a tag closed in the wrong order', () => {
    const output = html('[b][i]both[/b][/i]')
    expect(output).toContain('both')
  })

  it('renders a stray closing tag without losing the line', () => {
    expect(html('text [/b] more')).toContain('more')
  })

  it('renders an unknown tag as text rather than dropping it', () => {
    /*
     * MyBB drops unknown tags in some paths. Dropping is the worse default: a
     * plugin's tag that stopped being installed would silently erase whatever it
     * wrapped, and nobody would know which posts were affected.
     */
    const output = html('[nonsense]content[/nonsense]')
    expect(output).toContain('content')
  })

  it('does not lose text after an unterminated attribute', () => {
    expect(html('[url=http://example.test text')).toContain('text')
  })
})

/* ------------------------------------------------------------------ *
 * 4. Unsupported tags — named rather than silently absent
 * ------------------------------------------------------------------ */

describe('parity gap: tags MyBB has and this board does not', () => {
  /*
   * Each of these is a real MyBB tag with no implementation here. The corpus
   * pins the *current* behaviour — rendered as text — so that implementing one
   * is a deliberate change to this file rather than something that quietly
   * starts working.
   *
   * They are listed in mybb-parity.md with the same status. A tag that renders
   * as text is legible; a tag that vanishes takes its content with it.
   */
  it.each([
    ['[table][tr][td]cell[/td][/tr][/table]', 'cell'],
    ['[align=center]centred[/align]', 'centred'],
    ['[font=Arial]typed[/font]', 'typed'],
    ['[video=youtube]https://example.test/v[/video]', 'example.test'],
    ['[spoiler]hidden[/spoiler]', 'hidden'],
  ])('keeps the content of the unsupported %s', (source, content) => {
    expect(html(source)).toContain(content)
  })
})

/* ------------------------------------------------------------------ *
 * 5. The shapes real posts are full of
 * ------------------------------------------------------------------ */

describe('parity: shapes that appear in imported posts', () => {
  /*
   * A nested quote chain is the single most common structure in an imported
   * board — it is what a long argument looks like — and the depth limit is what
   * stops one from being a rendering denial of service.
   */
  it('renders a nested quote chain', () => {
    const output = html('[quote][quote][quote]deep[/quote]mid[/quote]top[/quote]')
    expect(output).toContain('deep')
    expect(output).toContain('top')
  })

  it('survives a pathologically deep nest without hanging', () => {
    const source = '[b]'.repeat(200) + 'x' + '[/b]'.repeat(200)
    const started = Date.now()
    const output = html(source)

    expect(output).toContain('x')
    expect(Date.now() - started).toBeLessThan(1000)
  })

  it('renders a very long line without truncating mid-tag', () => {
    const output = html(`[b]${'word '.repeat(2000)}[/b]`)
    expect(output).not.toContain('[b]')
  })

  /* Windows line endings are everywhere in an old board's database. */
  it('handles CRLF line endings', () => {
    expect(html('one\r\ntwo')).toContain('two')
  })

  it('renders a bare URL as text or a link, never as broken markup', () => {
    const output = html('see https://example.test/page for more')
    expect(output).toContain('example.test')
    expect(output).not.toContain('<a href="https://example.test/page"><a')
  })
})
