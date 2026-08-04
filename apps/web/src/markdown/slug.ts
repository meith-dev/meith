/**
 * Heading identifiers, compatible with the ones GitHub generates.
 *
 * This is not a stylistic choice. The documents under `docs/` are written to be
 * read on GitHub as well as here, and they link *within themselves* —
 * `operating.md` alone carries eleven `#anchor` links in its own table of
 * contents. If this site invented its own slugs, every one of those links would
 * 404 on the site while working perfectly in the repository, which is the kind
 * of breakage nobody notices until a reader reports it.
 *
 * So the algorithm is GitHub's, verbatim: strip formatting, lower-case, drop
 * everything that is not a letter, number, underscore, hyphen or space, then
 * turn runs of whitespace into single hyphens. Duplicates get `-1`, `-2`, … in
 * document order, which is also what GitHub does.
 */

/** The slug for one heading, before duplicate resolution. */
export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    /*
     * Unicode-aware: `mybb-parity.md` and the ADRs contain accented characters
     * and typographic punctuation, and an ASCII-only class would eat the letters
     * along with the punctuation. `\p{M}` keeps combining marks attached to the
     * letter they belong to.
     */
    .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, "")
    .replace(/\s+/g, "-")
}

/**
 * A slugger with memory. One per document — the numbering restarts for each
 * page, exactly as it does on GitHub.
 */
export function createSlugger(): (text: string) => string {
  const seen = new Map<string, number>()

  return (text: string) => {
    const base = slugify(text) || "section"
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    return count === 0 ? base : `${base}-${count}`
  }
}
