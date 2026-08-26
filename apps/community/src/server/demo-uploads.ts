import 'server-only'

import { rm } from 'node:fs/promises'

import { env, logger } from '@meith/core'

export async function clearUploadedFiles(): Promise<void> {
  if (env.FILESTORE_DRIVER !== 'local') {
    logger({ module: 'demo' }).warn(
      { driver: env.FILESTORE_DRIVER },
      'demo reset left uploads in place: only the local file store is cleared',
    )
    return
  }

  await rm(env.UPLOADS_DIR, { recursive: true, force: true })
}
