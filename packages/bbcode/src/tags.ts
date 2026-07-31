/**
 * F36 — the tag registry.
 *
 * One entry per supported tag, holding both what the parser needs to know
 * structurally (raw body? block? self-closing? legal parent?) and the single
 * function that turns it into HTML. Keeping the two together is deliberate: a
 * tag added with a renderer but no structural declaration is the class of bug
 * where `[code]` renders as a `<pre>` while its body has already been parsed
 * for BBCode.
 *
 * Every renderer receives *already-escaped* children (`context.html`) and must
 * escape anything else it emits. The invariant is stated once, here, and each
 * renderer below is short enough to check against it by eye.
 *
 * This is the built-in set. F37 adds smilies and admin-defined tags on top of
 * it, and does so by *extending this registry with declarative entries* — never
 * by admitting an admin-supplied regular expression, which is the mechanism
 * behind most of MyBB's custom-BBCode incidents.
 */
import { escapeAttribute, escapeHtml } from './escape'
import { safeImageUrl, safeUrl } from './url'

export interface RenderContext {
  /** The tag's attribute, verbatim and unvalidated. */
  readonly attribute: string | null
  /** The rendered children — already HTML, already escaped. */
  readonly html: string
  /** The children's source text, unescaped. Only URL-shaped tags want this. */
  readonly text: string
  /** For a raw tag, its verbatim body. Empty otherwise. */
  readonly raw: string
}

export interface TagSpec {
  /** The body is verbatim text: the tokeniser stops looking for tags inside. */
  readonly raw: boolean
  /** Block-level output, which absorbs one adjoining newline on each side. */
  readonly block: boolean
  /** Closed by the next sibling of the same name or by its parent (`[*]`). */
  readonly selfClosing: boolean
  /** Tags this may appear directly inside. `null` means anywhere. */
  readonly parents: readonly string[] | null
  render(context: RenderContext): string
}

/** `#rgb`, `#rrggbb`, or a bare CSS colour keyword. */
const COLOUR = /^(#[0-9a-f]{3}|#[0-9a-f]{6}|[a-z]{3,20})$/i

/**
 * The quoted author in `[quote='Bob' pid='42']`.
 *
 * The `pid` is parsed and then deliberately dropped: turning it into a link
 * needs the thread the post lives in, and a post id alone can address a post in
 * a forum the *reader* cannot see. A quote header that 404s for half the board
 * is worse than one without a link, so the link waits for a route that can
 * resolve the thread and re-check visibility.
 */
function quoteAuthor(attribute: string | null): string | null {
  if (attribute === null) return null
  const trimmed = attribute.trim()
  if (trimmed.length === 0) return null

  const quote = trimmed[0]
  if (quote === "'" || quote === '"') {
    const end = trimmed.indexOf(quote, 1)
    const author = end === -1 ? trimmed.slice(1) : trimmed.slice(1, end)
    return author.trim().length === 0 ? null : author
  }

  const author = trimmed.split(/\s+/)[0]!
  return author.length === 0 ? null : author
}

/** `[list]` → `<ul>`; `[list=1|a|A|i|I]` → an ordered list of that style. */
function listTag(attribute: string | null): { open: string; close: string } {
  const style = attribute?.trim() ?? ''
  if (style === '1') return { open: '<ol class="bb-list">', close: '</ol>' }
  if (/^[aAiI]$/.test(style)) {
    return { open: `<ol class="bb-list bb-list-${style.toLowerCase()}">`, close: '</ol>' }
  }
  return { open: '<ul class="bb-list">', close: '</ul>' }
}

function simple(tag: string): TagSpec {
  return {
    raw: false,
    block: false,
    selfClosing: false,
    parents: null,
    render: (context) => `<${tag}>${context.html}</${tag}>`,
  }
}

export const TAGS: Readonly<Record<string, TagSpec>> = {
  b: simple('strong'),
  i: simple('em'),
  u: simple('u'),
  s: simple('s'),

  color: {
    raw: false,
    block: false,
    selfClosing: false,
    parents: null,
    /*
     * The one place in the codebase where a literal colour is legitimate: it is
     * an author's decision inside their own post, not a theme decision, so R7's
     * "tokens only" does not apply and cannot — no token exists for "the colour
     * this member picked". The value is emitted inside `style` only after
     * matching COLOUR, which admits no `;`, `:`, `(`, or quote, so it cannot
     * open a second declaration or reach a `url()`.
     */
    render: (context) => {
      const colour = context.attribute?.trim() ?? ''
      if (!COLOUR.test(colour)) return context.html
      return `<span style="color:${escapeAttribute(colour)}">${context.html}</span>`
    },
  },

  size: {
    raw: false,
    block: false,
    selfClosing: false,
    parents: null,
    /*
     * A class, not an inline `font-size`. Sizes are a theme's business — the
     * default theme decides what "5" looks like at its own type scale — and
     * seven classes are a fixed vocabulary a theme can style, whereas an inline
     * length would be an author writing CSS lengths into every board.
     */
    render: (context) => {
      const size = context.attribute?.trim() ?? ''
      if (!/^[1-7]$/.test(size)) return context.html
      return `<span class="bb-size-${size}">${context.html}</span>`
    },
  },

  url: {
    raw: false,
    block: false,
    selfClosing: false,
    parents: null,
    /*
     * `rel="nofollow ugc noopener noreferrer"`: member-authored links are
     * exactly what `ugc` describes, `nofollow` keeps the board from being an
     * SEO donor to whoever registers, and `noopener` closes the reverse-tabnab
     * hole. No `target`, so a link opens where the reader chose to open it.
     */
    render: (context) => {
      const href = safeUrl(context.attribute ?? context.text)
      if (href === null) return context.html
      const label = context.attribute === null ? escapeHtml(context.text) : context.html
      return `<a href="${escapeAttribute(href)}" rel="nofollow ugc noopener noreferrer">${label}</a>`
    },
  },

  email: {
    raw: false,
    block: false,
    selfClosing: false,
    parents: null,
    render: (context) => {
      const address = (context.attribute ?? context.text).trim()
      const href = safeUrl(address.startsWith('mailto:') ? address : `mailto:${address}`, {
        allowMailto: true,
      })
      if (href === null) return context.html
      const label = context.attribute === null ? escapeHtml(context.text) : context.html
      return `<a href="${escapeAttribute(href)}" rel="nofollow ugc noopener noreferrer">${label}</a>`
    },
  },

  img: {
    raw: false,
    block: false,
    selfClosing: false,
    parents: null,
    /*
     * `alt=""` rather than a guessed description: an image whose alternative
     * text is its own URL is worse for a screen reader than one marked
     * decorative. `[img=alt]` is F37's job, alongside the rest of the
     * attribute-carrying tags.
     */
    render: (context) => {
      const src = safeImageUrl(context.text)
      if (src === null) return context.html
      return `<img src="${escapeAttribute(src)}" alt="" loading="lazy" class="bb-image">`
    },
  },

  quote: {
    raw: false,
    block: true,
    selfClosing: false,
    parents: null,
    render: (context) => {
      const author = quoteAuthor(context.attribute)
      const cite =
        author === null ? '' : `<cite class="bb-quote-author">${escapeHtml(author)} wrote:</cite>`
      return `<blockquote class="bb-quote">${cite}${context.html}</blockquote>`
    },
  },

  code: {
    raw: true,
    block: true,
    selfClosing: false,
    parents: null,
    /*
     * The body arrives verbatim from the tokeniser and is escaped here and
     * nowhere else. Newlines are *not* turned into `<br>`: a `<pre>` already
     * preserves them, and doubling them is the classic code-block bug. The
     * leading newline people type after `[code]` is dropped for the same reason.
     */
    render: (context) =>
      `<pre class="bb-code"><code>${escapeHtml(context.raw.replace(/^\r?\n/, ''))}</code></pre>`,
  },

  list: {
    raw: false,
    block: true,
    selfClosing: false,
    parents: null,
    render: (context) => {
      const { open, close } = listTag(context.attribute)
      return `${open}${context.html}${close}`
    },
  },

  '*': {
    raw: false,
    block: true,
    selfClosing: true,
    parents: ['list'],
    render: (context) => `<li>${context.html}</li>`,
  },
}

/** Tags whose body the tokeniser must not look inside. */
export const RAW_TAGS: ReadonlySet<string> = new Set(
  Object.entries(TAGS)
    .filter(([, spec]) => spec.raw)
    .map(([name]) => name),
)
