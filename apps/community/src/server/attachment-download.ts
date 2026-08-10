import 'server-only'

import { drivers } from '@meith/drivers'

import { resolveDownload } from './attachments'
import { getActor } from './context'
import { getContainer } from './container'

function notFound(): Response {
  return new Response('Not found', { status: 404 })
}

function contentDisposition(filename: string): string {
  const safe = filename.replace(/[^A-Za-z0-9._ -]/g, '_')
  return `attachment; filename="${safe}"`
}

export async function serveAttachment(
  rawId: string,
  want: 'file' | 'thumb',
): Promise<Response> {
  if (!/^[1-9]\d*$/.test(rawId)) return notFound()

  const actor = await getActor()
  const grant = await resolveDownload(actor, Number(rawId), want)
  if (grant === null) return notFound()

  const bytes = await drivers().files.get(grant.key)
  if (bytes === undefined) return notFound()

  if (want === 'file') {
    await getContainer().attachments?.recordDownload(grant.record.id)
  }

  return new Response(bytes as unknown as BodyInit, {
    headers: {
      'Content-Type': grant.contentType,
      'Content-Length': String(bytes.byteLength),
      'Content-Disposition': contentDisposition(grant.filename),
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'X-Frame-Options': 'DENY',
      'Cache-Control': 'private, max-age=0, must-revalidate',
    },
  })
}
