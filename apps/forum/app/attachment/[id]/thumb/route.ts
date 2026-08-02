/**
 * F42 — an attachment's thumbnail.
 *
 * A separate route rather than a query parameter on the download, so a cache
 * key, a log line and a permission failure all name which of the two objects
 * was asked for. Same authorisation, same headers — see
 * `src/server/attachment-download.ts`.
 */
import { serveAttachment } from '@/server/attachment-download'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return serveAttachment((await context.params).id, 'thumb')
}
