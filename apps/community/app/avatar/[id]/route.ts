/**
 * F58 — serving an avatar.
 *
 * Streamed through the app rather than redirected to a signed object-store URL,
 * for the reasons `src/server/attachment-download.ts` sets out: the headers are
 * the security control, and the permission is re-checked on every fetch.
 *
 * One difference from an attachment, and it is the cache. An avatar's URL
 * carries `?v=<updated_at>`, so a replacement is a *different* URL and the old
 * one can never be served from a cache by mistake. That makes a long
 * `max-age` safe on the response — which matters, because a thread page fetches
 * one of these per distinct author and a board's regulars appear on every page.
 * It stays `private` because who may see a member is still a permission
 * question and a shared cache must not answer it for us.
 */
import { drivers } from '@meith/drivers'

import { resolveAvatar } from '@/server/avatars'
import { getActor } from '@/server/context'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params
  if (!/^[1-9]\d*$/.test(id)) return new Response('Not found', { status: 404 })

  const actor = await getActor()
  const grant = await resolveAvatar(actor, Number(id))
  if (grant === null) return new Response('Not found', { status: 404 })

  const bytes = await drivers().files.get(grant.key)
  if (bytes === undefined) return new Response('Not found', { status: 404 })

  return new Response(bytes as unknown as BodyInit, {
    headers: {
      /*
       * The stored object is always a re-encode, and the encoder writes PNG or
       * JPEG. Reporting PNG for either would be a lie a browser mostly
       * tolerates; sniffing the two magic bytes here is cheap and honest.
       */
      'Content-Type': bytes[0] === 0xff ? 'image/jpeg' : 'image/png',
      'Content-Length': String(bytes.byteLength),
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      /* Safe because the URL changes when the image does. */
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
