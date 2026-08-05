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
import { imageHeaders } from '@/server/image-upload'

export const dynamic = 'force-dynamic'

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

  return new Response(bytes as unknown as BodyInit, {
    headers: imageHeaders(key, bytes.byteLength),
  })
}
