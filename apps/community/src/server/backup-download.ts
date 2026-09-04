import 'server-only'

import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'

import { isBundleName } from '@meith/backup'

import { resolveAdmin } from './admin'
import { currentBackupSettings, destinationFor, localBundlePath } from './backup-admin'

export const BACKUPS_PATH = '/admin/system/backups'

export const DOWNLOAD_LINK_SECONDS = 300

function notFound(): Response {
  return new Response('Not found', { status: 404 })
}

function seeOther(location: string): Response {
  return new Response(null, { status: 303, headers: { Location: location } })
}

export async function serveBackupDownload(name: string): Promise<Response> {
  if (!isBundleName(name)) return notFound()

  const resolved = await resolveAdmin()
  if ('denied' in resolved) return seeOther(BACKUPS_PATH)
  if (resolved.context.needsReauth) return seeOther(`${BACKUPS_PATH}?notice=reauth`)

  const local = await localBundlePath(name)
  if (local !== null) {
    const { size } = await stat(local)
    const body = Readable.toWeb(createReadStream(local)) as unknown as BodyInit
    return new Response(body, {
      headers: {
        'Content-Type': 'application/gzip',
        'Content-Length': String(size),
        'Content-Disposition': `attachment; filename="${name}"`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      },
    })
  }

  const destination = destinationFor(await currentBackupSettings())
  if (destination === undefined) return notFound()
  const listed = await destination.list()
  if (!listed.some((bundle) => bundle.name === name)) return notFound()

  return seeOther(await destination.downloadUrl(name, DOWNLOAD_LINK_SECONDS))
}
