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
