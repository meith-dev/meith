/**
 * The relative 303, which is the whole of the read-marker routes' answer.
 *
 * Three properties, and each is a bug this replaced:
 *
 *  - **303**, so the browser turns the POST into a GET and a reload does not
 *    re-submit it;
 *  - a `Location` that is **relative**, because the absolute one these routes
 *    used was built from `request.url` — the address Next's own server is
 *    listening on, not the one the member is at — and the board's
 *    `form-action 'self'` then refused to follow it, so every Mark-read control
 *    silently did nothing;
 *  - a path that **cannot leave the board**, so the code that fixed an
 *    off-by-one-origin redirect cannot become one.
 */
import { describe, expect, it } from 'vitest'

import { seeOther } from './see-other'

describe('seeOther', () => {
  it('is a 303 with the path verbatim in Location', () => {
    const response = seeOther('/200-general')

    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('/200-general')
  })

  it('keeps the query and the fragment, which carry where to land', () => {
    /* A thread's read marker returns to the post that was being read. */
    expect(seeOther('/thread/4-welcome?post=11#post-11').headers.get('location')).toBe(
      '/thread/4-welcome?post=11#post-11',
    )
  })

  it('never states the board’s own origin', () => {
    /*
     * The point of the whole thing: an answer that names no host cannot name
     * the wrong one, whatever Next thinks its address is behind a proxy.
     */
    expect(seeOther('/').headers.get('location')).not.toMatch(/^https?:/)
  })

  it('refuses an absolute URL', () => {
    expect(() => seeOther('https://evil.example/')).toThrow(/path on this board/)
  })

  it('refuses a protocol-relative URL, which looks like a path and is not', () => {
    /*
     * `//evil.example` is the slip worth guarding: it starts with a slash, it
     * reads as a path, and a browser resolves it as another origin. Building
     * one out of a slug that began with a slash is an ordinary mistake.
     */
    expect(() => seeOther('//evil.example/')).toThrow(/path on this board/)
  })

  it('refuses a bare relative path, which would resolve against the route', () => {
    /* `../` from `/api/read/forum/200` is not the board root. */
    expect(() => seeOther('200-general')).toThrow(/path on this board/)
  })
})
