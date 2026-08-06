import { serveAttachment } from '@/server/attachment-download'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  return serveAttachment((await context.params).id, 'file')
}
