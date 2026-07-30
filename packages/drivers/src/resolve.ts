/**
 * The one place driver implementations are chosen (F05).
 *
 * Everything downstream receives a `Drivers` bundle and never asks which
 * implementation it holds. If a `if (env.QUEUE_DRIVER === ...)` appears in a
 * domain package or a route, that is the bug this module exists to prevent.
 */

import {
  ConfigurationError,
  env,
  type CacheDriver,
  type Drivers,
  type FileStore,
  type MailDriver,
  type QueueDriver,
} from '@forum/core'

import { MemoryCache } from './cache/memory-cache'
import { NextCacheDriver } from './cache/next-cache'
import { LocalFileStore } from './files/local-file-store'
import { HttpMailDriver, LogMailDriver } from './mail'
import { MemoryQueue } from './queue/memory-queue'
import { PostgresQueue } from './queue/postgres-queue'

/**
 * Cached per process.
 *
 * Drivers hold connections and in-memory state, so rebuilding them per request
 * would both leak sockets and silently empty the memory cache on every request.
 */
let bundle: Drivers | undefined

function buildQueue(): QueueDriver {
  switch (env.QUEUE_DRIVER) {
    case 'postgres':
      return new PostgresQueue()
    case 'memory':
      return new MemoryQueue()
    case 'redis':
      /*
       * Deliberately unimplemented rather than silently downgraded: an operator
       * who sets QUEUE_DRIVER=redis and gets an in-memory queue would lose every
       * job on each cold start with no indication anything was wrong.
       */
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
      // Arrives with attachments (Phase 4). Disk covers dev and self-hosting.
      throw new ConfigurationError(
        'FILESTORE_DRIVER=s3 is not implemented yet. Use "local".',
      )
  }
}

function buildMail(): MailDriver {
  switch (env.MAIL_DRIVER) {
    case 'log':
      return new LogMailDriver()

    case 'http': {
      /*
       * env's cross-field rules already require these together, but narrowing
       * here keeps the driver's constructor honest about needing non-optional
       * strings rather than asserting non-null.
       */
      const { MAIL_HTTP_ENDPOINT, MAIL_HTTP_TOKEN, MAIL_FROM } = env
      if (!MAIL_HTTP_ENDPOINT || !MAIL_HTTP_TOKEN || !MAIL_FROM) {
        throw new ConfigurationError(
          'MAIL_DRIVER=http requires MAIL_HTTP_ENDPOINT, MAIL_HTTP_TOKEN and MAIL_FROM.',
        )
      }
      return new HttpMailDriver(MAIL_HTTP_ENDPOINT, MAIL_HTTP_TOKEN, MAIL_FROM)
    }

    case 'smtp':
      /*
       * Not silently downgraded to the log driver: an operator who configured
       * SMTP and saw no errors would assume password resets were being
       * delivered while every one was discarded.
       */
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

/** Test-only: forces the next `drivers()` call to rebuild from current env. */
export function resetDriversForTests(): void {
  bundle = undefined
}
