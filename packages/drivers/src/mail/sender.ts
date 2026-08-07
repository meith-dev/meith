/**
 * The `From` header, composed once for every transport.
 *
 * Its own module rather than a function in `index.ts` so that `smtp.ts` can use
 * it without importing the barrel that imports `smtp.ts`. The rule it encodes is
 * transport-independent by nature — an address and a display name become one
 * RFC 5322 string the same way over HTTP and over SMTP — and having two copies
 * would mean the sanitising below applying on one path and not the other.
 */

/**
 * Compose an RFC 5322 `From` value from the board's address and its display
 * name.
 *
 * The name is operator-supplied text (`mail.from_name`) on its way into a
 * header, so it is **sanitised rather than trusted**:
 *
 *  - Control characters go, CR and LF above all. A newline in a header value is
 *    header injection wherever this string reaches SMTP, and the fact that JSON
 *    would escape it on *one* transport is a property of that driver rather than
 *    a reason to hand a provider a name with a line break in it. Now that SMTP
 *    is a transport this board actually speaks, that is no longer hypothetical.
 *  - `\` and `"` are escaped, because the name is emitted as a quoted string —
 *    a name containing a quote would otherwise close it early and leave the
 *    rest to be parsed as address syntax.
 *  - Always quoted, never bare. An unquoted display name may not contain `.`,
 *    `,` or `@`, and "Board Admin, Ltd." is an ordinary thing to type.
 *
 * A name that is empty once trimmed yields the bare address — the same header
 * every message carried before this field existed.
 */
export function formatSender(address: string, name?: string): string {
  const cleaned = stripControlCharacters(name ?? '').trim()
  if (cleaned === '') return address

  const escaped = cleaned.replace(/([\\"])/g, '\\$1')
  return `"${escaped}" <${address}>`
}

/**
 * Drop every C0/C1 control character and DEL.
 *
 * The class is written as escapes rather than as literal characters: a raw
 * control character in source is invisible in every editor and diff, which is
 * why the workspace guard bans one — and this is the file where naming them is
 * the whole point.
 */
function stripControlCharacters(value: string): string {
  // eslint-disable-next-line no-control-regex -- matching control characters is this function's job
  return value.replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
}
