import 'server-only'

import { rm } from 'node:fs/promises'

import { env, logger } from '@meith/core'

/**
 * Everything a visitor uploaded, thrown away with the board that referenced it.
 *
 * Only local storage is cleared. A demo pointed at an object store is not a
 * configuration this project asks anyone to run, and quietly issuing bulk
 * deletes against a bucket somebody else's board might share is a worse failure
 * than leaving files behind.
 *
 * Kept apart from the rest of the demo helpers because the container calls this
 * one, and the others call the container.
 */
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
