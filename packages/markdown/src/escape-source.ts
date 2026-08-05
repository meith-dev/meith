/**
 * Escaping text so that Markdown reads it as text.
 *
 * The inverse of everything else in this package: `escape.ts` protects *HTML*
 * from a member's words, and this protects a member's *words* from Markdown.
 * Two callers need it, and both are places where text that was never Markdown
 * source is about to become some:
 *
 *  - `bbcode.ts`, converting a board that used to speak BBCode — where `*` was
 *    an asterisk, `# 1 fan` was not a heading, and `snake_case` was a variable;
 *  - `quote.ts`, turning a rendered post back into source, where the words
 *    inside a code span or a link's label are text and nothing else.
 *
 * It lives in its own module so those two cannot drift apart. A quote whose
 * asterisks survived and a conversion whose did not would be the same bug
 * reported twice.
 */

/**
 * Every character Markdown would read as syntax, made literal.
 *
 * Line-leading markers are escaped only at the start of a line, because
 * escaping them everywhere litters converted text with backslashes in front of
 * every hyphen anybody ever typed mid-sentence.
 */
export function escapeMarkdownText(value: string): string {
  return value
    .replace(/([\\`*_[\]<>|~])/g, '\\$1')
    .split('\n')
    .map((line) => line.replace(/^(\s*)(:::|[#>+=-]|\d+[.)])/, '$1\\$2'))
    .join('\n')
}

/**
 * A name that cannot reformat the line it is put on.
 *
 * Stripped rather than escaped, and that is deliberate: an attribution reading
 * `**ada**` escaped to `\*\*ada\*\*` is uglier in the composer than one reading
 * `ada`, and the *source* is what somebody then edits. The rendered form is
 * safe either way — this is about what the box shows them.
 */
export function plainAuthorName(name: string): string {
  return name.replace(/[*_[\]`\\]/g, '').trim()
}
