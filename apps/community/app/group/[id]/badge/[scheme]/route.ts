/**
 * Serving a usergroup's badge.
 *
 * The board logo's route with a row id in the path, and the same reasoning
 * throughout: streamed through the app so the headers travel with the bytes,
 * public because a badge appears beside every name a guest can already see, and
 * `immutable` because the URL carries the stored key's UUID and therefore
 * changes whenever the image does.
 *
 * `badgeKey` re-checks the stored value — including that the key names *this*
 * group — before it becomes a path in the file store. A row an operator edited
 * with SQL, or one a restore carried across from another board, is exactly as
 * untrusted as a form field.
 */
import { drivers } from '@meith/drivers'

import { badgeKey } from '@/server/group-badge'
import { imageHeaders, isImageScheme } from '@/server/image-upload'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; scheme: string }> },
): Promise<Response> {
  const { id, scheme } = await context.params
  if (!/^[1-9]\d*$/.test(id) || !isImageScheme(scheme)) {
    return new Response('Not found', { status: 404 })
  }

  const key = await badgeKey(Number(id), scheme)
  if (key === null) return new Response('Not found', { status: 404 })

  const bytes = await drivers().files.get(key)
  if (bytes === undefined) return new Response('Not found', { status: 404 })

  return new Response(bytes as unknown as BodyInit, {
    headers: imageHeaders(key, bytes.byteLength),
  })
}
