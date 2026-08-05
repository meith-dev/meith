/**
 * F36/F58 — which constructs a body may use.
 *
 * BBCode restricted itself by handing the parser a smaller **tag registry**: a
 * signature was rendered against a map with no `img` in it, so `[img]` came out
 * as the text it was. Markdown has no registry to shrink — its constructs are
 * syntax, not names — so the same idea is expressed as a set of switches the
 * parser consults, and the failure mode is kept exactly: a construct that is
 * off is not refused, it is **left as the characters somebody typed**.
 *
 * That matters more here than it did with BBCode. A member pasting a signature
 * from another board gets `## Hi` rather than a validation error and an empty
 * box, and a moderator reading it can see what they meant. Refusal is a policy
 * about *length* (`@meith/signatures`), never about syntax.
 */
export interface MarkdownFeatures {
  /** `# Heading`, and the `===`/`---` underlined form. */
  readonly headings: boolean
  /** `- item`, `1. item`, and `- [ ]` task items. */
  readonly lists: boolean
  /** `> quoted`. */
  readonly quotes: boolean
  /** ```` ```fenced ```` code blocks. */
  readonly code: boolean
  /** `` `code` `` spans. Separate from blocks: one is a wall, one is a word. */
  readonly codeSpans: boolean
  /** GFM pipe tables. */
  readonly tables: boolean
  /** `---` on its own line. */
  readonly rules: boolean
  /** `![alt](src)`. Off means the alt text renders and the image does not. */
  readonly images: boolean
  /** `[text](href)`, `<https://…>`, and bare URLs. */
  readonly links: boolean
  /** `*emphasis*`, `**strong**`, `~~strike~~`. */
  readonly emphasis: boolean
  /** `:::name` blocks and `:name[…]` spans, from the board's vocabulary (F71). */
  readonly directives: boolean
}

/** Everything. What a post body is rendered with. */
export const FULL_FEATURES: MarkdownFeatures = {
  headings: true,
  lists: true,
  quotes: true,
  code: true,
  codeSpans: true,
  tables: true,
  rules: true,
  images: true,
  links: true,
  emphasis: true,
  directives: true,
}

/**
 * What a signature may use (F58).
 *
 * Text styling and links, and nothing that changes the *size* of the page —
 * because a signature repeats under every post its author has ever made. Each
 * omission is that one argument:
 *
 *   - **images** — an image per post is what makes a thread page unreadable,
 *     and a remote one is a tracking beacon that reports every reader's IP
 *     address to whoever hosts it. The same objection D61 makes about remote
 *     avatars.
 *   - **headings** — an `<h2>` under every post wrecks the document outline a
 *     screen reader navigates the thread by.
 *   - **quotes** — a quote block inside a signature is a quote of nothing.
 *   - **code blocks, tables, rules, lists** — all four are walls, and the
 *     signature length limit is measured in characters, not in height.
 */
export const SIGNATURE_FEATURES: MarkdownFeatures = {
  headings: false,
  lists: false,
  quotes: false,
  code: false,
  codeSpans: true,
  tables: false,
  rules: false,
  images: false,
  links: true,
  emphasis: true,
  directives: false,
}
