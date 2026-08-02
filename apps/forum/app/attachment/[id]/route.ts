/**
 * F42 — downloading an attachment.
 *
 * A route handler rather than a page: the response is bytes with headers that
 * are themselves the security control. Everything about why lives in
 * `src/server/attachment-download.ts`, which the thumbnail route shares.
 */
import { serveAttachment } from '@/server/attachment-download'

/** Never cached at the edge: the answer depends on who is asking. */
export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return serveAttachment((await context.params).id, 'file')
}
