import { drivers } from '@meith/drivers'

import { faviconKey } from '@/server/branding'
import { imageHeaders } from '@/server/image-upload'

export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  const key = await faviconKey()
  if (key === null) return new Response(null, { status: 404 })

  const bytes = await drivers().files.get(key)
  if (bytes === undefined) return new Response(null, { status: 404 })

  return new Response(bytes as unknown as BodyInit, {
    headers: imageHeaders(key, bytes.byteLength),
  })
}
