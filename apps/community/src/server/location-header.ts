export const PATH_HEADER = 'x-forum-path'

/**
 * Set by the middleware when it has just minted the guest cookie, meaning the
 * client has not sent one back yet.
 *
 * It exists because the obvious test does not work: a cookie set on a
 * `NextResponse.next()` response is reflected into the request the render sees,
 * so neither `cookies()` nor the raw `Cookie` header can tell "the client kept
 * this" from "we made it up a millisecond ago". Without the distinction every
 * request from something that discards cookies wrote a presence row, which
 * measured as twelve rows from twelve crawler requests.
 *
 * The middleware sets it or deletes it on every request, so a client cannot
 * supply its own.
 */
export const FRESH_GUEST_HEADER = 'x-forum-fresh-guest'
