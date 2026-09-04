import { serveBackupDownload } from '@/server/backup-download'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  context: { params: Promise<{ name: string }> },
): Promise<Response> {
  const { name } = await context.params
  return serveBackupDownload(name)
}
