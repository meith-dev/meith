import { openApiDocument } from '@meith/api'

import { JSON_MEDIA_TYPE, SPEC_CACHE } from '@/server/api/http'
import { CODE_VERSION } from '@/server/upgrade-notice'

export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  return new Response(JSON.stringify(openApiDocument(CODE_VERSION)), {
    headers: { 'content-type': JSON_MEDIA_TYPE, 'cache-control': SPEC_CACHE },
  })
}
