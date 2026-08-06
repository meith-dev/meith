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

  const key = await logoKey(scheme)
  if (key === null) return new Response('Not found', { status: 404 })

  const bytes = await drivers().files.get(key)
  if (bytes === undefined) return new Response('Not found', { status: 404 })

  return new Response(bytes as unknown as BodyInit, {
    headers: imageHeaders(key, bytes.byteLength),
  })
}
