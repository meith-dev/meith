/**
 * F36 — the bounds every render runs inside.
 *
 * A post body is attacker-controlled text that a server renders, so every loop
 * in the parser needs a ceiling that does not depend on the input being
 * reasonable. The failure mode chosen for each limit matters as much as the
 * number: **nothing here throws**. A post that trips a limit still renders,
 * with the offending construct demoted to plain text, because a body that
 * cannot render is a thread page that returns a 500 for everyone who opens it.
 */
export interface MarkdownLimits {
  /** Characters of source considered. Beyond this the tail renders as text. */
  readonly maxInput: number
  /**
   * Nested containers — quotes, lists, directives.
   *
   * Markdown makes this cheaper to reach than BBCode did: `>>>>>>>>>>>>>>>` is
   * fifteen blockquotes and one keypress each. A container that would exceed
   * the ceiling keeps its marker as literal text.
   */
  readonly maxDepth: number
  /** AST nodes. Beyond this the remaining source becomes one text node. */
  readonly maxNodes: number
  /** Characters in a URL. Longer ones are not links. */
  readonly maxUrlLength: number
  /**
   * Delimiter runs (`*`, `_`, `~`) considered by the emphasis matcher.
   *
   * That matcher is quadratic in the worst case — inherent to CommonMark's
   * rules, not a shortcut taken here — and a line of two thousand asterisks is
   * a body somebody wrote to find out what happens. Past the ceiling the
   * remaining runs stay literal text, which is what they look like anyway.
   */
  readonly maxDelimiters: number
}

/**
 * The shipped limits.
 *
 * `maxInput` is deliberately larger than `posting.max_length`'s default: this
 * is the last line of defence, not the posting rule. It has to hold for bodies
 * that predate a tightened setting, and for the importer (F85), which writes
 * whatever the old board stored.
 */
export const DEFAULT_LIMITS: MarkdownLimits = {
  maxInput: 64 * 1024,
  maxDepth: 12,
  maxNodes: 4000,
  maxUrlLength: 2048,
  maxDelimiters: 2000,
}
