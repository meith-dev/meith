/**
 * Serving the board's logo.
 *
 * Streamed through the app rather than handed out as a store URL, for the
 * reason the avatar route gives: the headers are the security control, and a
 * route that redirected to an object-store URL would be sending the reader
 * somewhere those headers are not.
 *
 * ## It is public, and that is the difference from an avatar
 *
 * There is no permission to check. A board's logo is on the login page, the
 * error page and every page a guest can reach, so this asks nobody who they
 * are — which is what makes the response cacheable by a *shared* cache rather
 * than only by the reader's own. A logo fetched once per CDN edge instead of
 * once per visitor is the whole reason to say so.
 *
 * The URL carries the stored key, and the key carries a UUID minted at upload,
 * so replacing a logo produces a different URL. That is what makes a year-long
 * `max-age` safe: nothing has to expire, because nothing is ever reused.
 */
import { drivers } from '@meith/drivers'

import { isLogoScheme, logoKey } from '@/server/branding'

export const dynamic = 'force-dynamic'

/** The four this board will store, and therefore the four it will serve. */
const CONTENT_TYPE: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  svg: 'image/svg+xml',
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ scheme: string }> },
): Promise<Response> {
  const { scheme } = await context.params
  if (!isLogoScheme(scheme)) return new Response('Not found', { status: 404 })

  /*
   * `logoKey` re-checks the stored value against the shape this board writes.
   * The settings row it comes from is editable from the CLI and travels in a
   * restored backup, and it is about to become a path in a file store.
   */
  const key = await logoKey(scheme)
  if (key === null) return new Response('Not found', { status: 404 })

  const bytes = await drivers().files.get(key)
  if (bytes === undefined) return new Response('Not found', { status: 404 })

  const contentType = CONTENT_TYPE[key.split('.').pop() ?? ''] ?? 'application/octet-stream'

  return new Response(bytes as unknown as BodyInit, {
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(bytes.byteLength),
      /*
       * The same pair the avatar route sends, and they matter more here because
       * this one may be an SVG. `nosniff` holds the browser to the type above,
       * and the sandbox means that even a reader who navigates straight to the
       * file gets a document that can run nothing and fetch nothing. An SVG
       * inside an `<img>` — which is how the header renders it — is already
       * inert; this is for every other way somebody can reach the URL.
       */
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      /* Safe because the URL changes when the image does. */
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
