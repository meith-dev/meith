/**
 * F71 — the word filter, applied at render time.
 *
 * **Reversible, because the post is never changed.** MyBB and most boards
 * rewrite the stored text on save, which means the original is gone: turning a
 * filter off does not bring the word back, correcting a bad pattern cannot undo
 * what it did to three years of posts, and a filter added today never touches
 * anything written yesterday. Applying at render costs a pass over the HTML and
 * buys all three of those back — a filter is a *view* of the board, and can be
 * changed or removed with no consequence at all.
 *
 * **Only text is substituted, never markup.** This runs on rendered HTML, so a
 * naive `replace` would rewrite the inside of `<a href="…">` and
 * `<img src="…">` — turning a filtered word in a URL into a broken link, and a
 * pattern like `a` into a catastrophe. The scanner walks the string tag by tag
 * and substitutes only in the spans between them.
 *
 * The cost is honest: this is a render-path pass over every post body, so the
 * rule set is expected to be small and is compiled once per render rather than
 * per post.
 */

export interface WordFilterRule {
  /** The text to look for. Matched case-insensitively. */
  readonly pattern: string
  /** What to show instead. May be empty, which removes the word. */
  readonly replacement: string
  /**
   * Match only whole words.
   *
   * On by default in the editor for the reason the "Scunthorpe problem" is
   * named after: a substring filter on an inoffensive fragment silently mangles
   * place names, surnames and ordinary words, and the person it happens to has
   * no idea why their post looks wrong.
   */
  readonly wholeWord: boolean
}

/** A rule set compiled once, for a render pass over many posts. */
export interface CompiledWordFilter {
  readonly rules: readonly { readonly matcher: RegExp; readonly replacement: string }[]
}

/** Characters that would otherwise make a pattern a regular expression. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Compile a rule set.
 *
 * Patterns are escaped, so what an operator types is what is matched. Letting
 * them write regular expressions would be a foot-gun on a render path — a
 * catastrophically backtracking pattern typed into an admin form is a board
 * that stops rendering — and the feature is "replace this word", not "run this
 * program on every post".
 */
export function compileWordFilter(rules: readonly WordFilterRule[]): CompiledWordFilter {
  return {
    rules: rules
      .filter((rule) => rule.pattern !== '')
      .map((rule) => ({
        matcher: new RegExp(
          rule.wholeWord
            ? `\\b${escapeRegExp(rule.pattern)}\\b`
            : escapeRegExp(rule.pattern),
          'gi',
        ),
        replacement: rule.replacement,
      })),
  }
}

/**
 * Apply a compiled filter to rendered HTML.
 *
 * The scan is deliberately simple: everything from `<` to the next `>` is
 * markup and is copied through untouched; everything else is text and is
 * substituted. That is sound for this input because the HTML being filtered is
 * the renderer's *own* output — `@meith/markdown` produces a fixed, sanitised
 * tag set with no raw `<` surviving in text (it is escaped to `&lt;`), so a
 * bare angle bracket in a post cannot desynchronise the scanner.
 */
export function applyWordFilter(html: string, filter: CompiledWordFilter): string {
  if (filter.rules.length === 0 || html === '') return html

  let output = ''
  let index = 0

  while (index < html.length) {
    const tagStart = html.indexOf('<', index)

    if (tagStart === -1) {
      output += substitute(html.slice(index), filter)
      break
    }

    output += substitute(html.slice(index, tagStart), filter)

    const tagEnd = html.indexOf('>', tagStart)
    if (tagEnd === -1) {
      /*
       * An unterminated tag. Copied verbatim rather than filtered: this cannot
       * happen with the renderer's own output, and if it ever does, leaving it
       * alone is the failure that does not also corrupt it.
       */
      output += html.slice(tagStart)
      break
    }

    output += html.slice(tagStart, tagEnd + 1)
    index = tagEnd + 1
  }

  return output
}

/**
 * The matchers are global regexes reused across every post in a render pass,
 * which is normally a trap — a stateful `lastIndex` carried between calls skips
 * matches from the second post onwards, and presents as "the filter works
 * sometimes". `String#replace` with a `/g` pattern is the one method that is
 * immune: it scans from the start and resets `lastIndex` itself.
 *
 * So there is no defensive reset here, because there is nothing to reset and a
 * line that cannot be proven by a test is a line that will be believed for the
 * wrong reason. Anything added below that uses `exec` or `test` on these
 * matchers **does** need one.
 */
function substitute(text: string, filter: CompiledWordFilter): string {
  let result = text
  for (const rule of filter.rules) {
    result = result.replace(rule.matcher, rule.replacement)
  }
  return result
}
