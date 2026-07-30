/**
 * The one way identifiers are case-folded.
 *
 * Usernames and email addresses are compared case-insensitively, which means a
 * *stored* folded form (`users.username_lower`, `users.email_lower`) has to
 * agree with the folded form computed at lookup time — across processes, hosts
 * and deploys. `String#toLocaleLowerCase()` cannot promise that: with no
 * argument it folds using the runtime's default locale, which is a property of
 * the host, not of the data.
 *
 * Under a Turkish or Azeri default locale (`LANG=tr_TR`) 'I' folds to 'ı'
 * (U+0131, dotless i) rather than 'i'. Two concrete failures follow:
 *
 *  - Registration folds 'IVAN' to 'ıvan' while 'Ivan' folds to 'ivan', so the
 *    uniqueness check sees two different names and F18's "duplicate username
 *    differing only by case is rejected" quietly stops holding.
 *  - A row written on one host and read on another with a different locale
 *    never matches, so the account simply cannot log in.
 *
 * `toLowerCase()` applies the locale-independent Unicode default mapping, which
 * is what an identifier wants. Use this helper rather than calling it directly
 * so the rule stays greppable and enforceable.
 */
export function foldIdentifier(value: string): string {
  return value.trim().toLowerCase()
}
