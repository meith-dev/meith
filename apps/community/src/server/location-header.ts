export const PATH_HEADER = 'x-forum-path'

/**
 * The query string that came with `PATH_HEADER`, leading `?` included, or
 * absent when there was none.
 *
 * Separate from the path because the path has readers that must not see a
 * query: a presence row records where somebody is, and `/admin/settings` is one
 * place however many groups it can be filtered by. The panel rail is the reader
 * that needs both — its settings sections differ only by `?group=`, so a rail
 * given the path alone cannot say which one is open.
 */
export const QUERY_HEADER = 'x-forum-query'

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
