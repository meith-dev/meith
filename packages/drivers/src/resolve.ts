import {
  ConfigurationError,
  env,
  type CacheDriver,
  type Drivers,
  type FileStore,
  type MailDriver,
  type QueueDriver,
} from '@meith/core'

import { MemoryCache } from './cache/memory-cache'
import { NextCacheDriver } from './cache/next-cache'
import { LocalFileStore } from './files/local-file-store'
import { S3FileStore } from './files/s3-file-store'
import { HttpMailDriver, LogMailDriver } from './mail'
import { MemoryQueue } from './queue/memory-queue'
import { PostgresQueue } from './queue/postgres-queue'

let bundle: Drivers | undefined

function buildQueue(): QueueDriver {
  switch (env.QUEUE_DRIVER) {
    case 'postgres':
      return new PostgresQueue()
    case 'memory':
      return new MemoryQueue()
    case 'redis':
      throw new ConfigurationError(
        'QUEUE_DRIVER=redis is not implemented yet. Use "postgres".',
      )
  }
}

function buildCache(): CacheDriver {
  switch (env.CACHE_DRIVER) {
    case 'next':
      return new NextCacheDriver()
    case 'memory':
      return new MemoryCache()
    case 'redis':
      throw new ConfigurationError(
        'CACHE_DRIVER=redis is not implemented yet. Use "next" or "memory".',
      )
  }
}

function buildFiles(): FileStore {
  switch (env.FILESTORE_DRIVER) {
    case 'local':
      return new LocalFileStore(env.UPLOADS_DIR)
    case 's3':
      return S3FileStore.fromEnv(env)
  }
}

function buildMail(): MailDriver {
  switch (env.MAIL_DRIVER) {
    case 'log':
      return new LogMailDriver()

    case 'http': {
      const { MAIL_HTTP_ENDPOINT, MAIL_HTTP_TOKEN, MAIL_FROM } = env
      if (!MAIL_HTTP_ENDPOINT || !MAIL_HTTP_TOKEN || !MAIL_FROM) {
        throw new ConfigurationError(
          'MAIL_DRIVER=http requires MAIL_HTTP_ENDPOINT, MAIL_HTTP_TOKEN and MAIL_FROM.',
        )
      }
      return new HttpMailDriver(MAIL_HTTP_ENDPOINT, MAIL_HTTP_TOKEN, MAIL_FROM)
    }

    case 'smtp':
      throw new ConfigurationError(
        'MAIL_DRIVER=smtp is not implemented yet. Use "http" or "log".',
      )
  }
}

export function drivers(): Drivers {
  bundle ??= {
    queue: buildQueue(),
    cache: buildCache(),
    files: buildFiles(),
    mail: buildMail(),
  }
  return bundle
}

export function resetDriversForTests(): void {
  bundle = undefined
}
