/**
 * The two rules about an origin that depend on nothing at all.
 *
 * Their own module because both `definitions.ts` and `board-url.ts` need them,
 * and `board-url.ts` needs `SettingsSnapshot` — so putting them there made a
 * cycle: definitions → board-url → store → definitions. Depcruise caught it,
 * which is what that rule is for; a type-only import is still an import to a
 * tool reading the source, and to a bundler deciding initialisation order.
 *
 * Nothing here imports anything, which is the property that keeps it true.
 */

/**
 * Strip trailing slashes, and only trailing slashes.
 *
 * Every caller used to do this inline with its own `replace(/\/+$/, '')`, which
 * is five copies of a rule and one place for the sixth to be forgotten — and a
 * forgotten one produces `https://board.example//thread/1`, which works
 * everywhere except in the canonical tag and the feed id, where it silently
 * splits one thread into two entries for every reader.
 */
export function normaliseOrigin(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

/**
 * Is this something the board can put in an e-mail?
 *
 * Deliberately stricter than "parses as a URL". `mailto:noreply@example.com`
 * parses. So does `javascript:alert(1)`, and so does a path-only string in some
 * parsers — and this value is concatenated with a path and emitted into an
 * `href`, so the check has to be about the *scheme* rather than about
 * well-formedness.
 */
export function isUsableOrigin(value: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(normaliseOrigin(value))
  } catch {
    return false
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
  if (parsed.hostname === '') return false
  /*
   * A path, query or fragment means somebody pasted the address of a page
   * rather than the address of the board, and every link built from it would
   * carry that page's path in the middle. Rejected on the way in, where it can
   * be explained, rather than discovered in a mail client.
   */
  return (
    (parsed.pathname === '' || parsed.pathname === '/') &&
    parsed.search === '' &&
    parsed.hash === ''
  )
}
