import 'server-only'

/**
 * A 303 back to a page on this board, addressed **relatively**.
 *
 * ## Why this exists rather than `NextResponse.redirect(new URL(path, request.url))`
 *
 * That is what the three read-marker routes did, and it meant the Mark-read
 * controls did nothing a member could see. `request.url` inside a route handler
 * is not the address the browser is on: Next reconstructs it from the server it
 * is listening on, so on a board reached at `https://forum.example` the handler
 * sees `http://localhost:3000/...` and the `Location` it builds points at
 * localhost. Behind a reverse proxy — which is every real deployment — that is
 * every request.
 *
 * The browser then refuses to follow it, and the reason is the board's own
 * Content-Security-Policy: `form-action 'self'` governs where a form may end up,
 * **including through a redirect**. So Chromium reports
 *
 *     Refused to send form data to '…/api/read/all' because it violates the
 *     following Content Security Policy directive: "form-action 'self'".
 *
 * and aborts the navigation. The write has already happened by then, so the
 * symptom is the worst possible one: the member presses "Mark all forums read",
 * the page does not change, everything still looks unread — and it *was* marked
 * read, so pressing it again looks equally broken. Nothing is logged, because
 * from the server's point of view the request succeeded.
 *
 * ## Relative is the fix, not a workaround
 *
 * A `Location` may be a relative reference (RFC 7231 §7.1.2) and the browser
 * resolves it against the URL it actually asked for. That is the correct
 * semantics for "go back to the page you were on": the answer cannot be wrong
 * about the board's own address, because it never states it. It also satisfies
 * `form-action 'self'` by construction — a same-origin target cannot be
 * anything else.
 *
 * `NextResponse.redirect` cannot express this: it requires an absolute URL and
 * would re-introduce the guess. A bare `Response` can, and a 303 is what turns
 * a POST into a GET so that a reload does not re-submit.
 *
 * Every other write on this board is a Server Action and redirects through
 * `redirect()`, which is already relative — which is why these three routes were
 * the only ones affected, and why nothing else needs this.
 */
export function seeOther(path: string): Response {
  /*
   * Guarded, because the value of a relative redirect is that it cannot leave
   * the board: a caller that passed `//evil.example` — a protocol-relative URL,
   * and a plausible slip when building a path from a slug — would send the
   * member off-site with the same code that is here to stop exactly that.
   */
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new Error(`seeOther expects a path on this board, got: ${path}`)
  }

  return new Response(null, { status: 303, headers: { location: path } })
}
