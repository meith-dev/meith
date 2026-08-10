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
      'Content-Type': bytes[0] === 0xff ? 'image/jpeg' : 'image/png',
      'Content-Length': String(bytes.byteLength),
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
