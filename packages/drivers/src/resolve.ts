import {
  ConfigurationError,
  env,
  type CacheDriver,
  type Drivers,
  type FileStore,
  type MailDriver,
  type QueueDriver,
} from '@meith/core'

import { PostgresSettingsRepository, getDb } from '@meith/db'
import {
  NO_MAIL,
  SettingsSnapshot,
  mailConfigFromEnvironment,
  mailConfigFromSettings,
  type MailConfig,
} from '@meith/settings'

import { NextCacheDriver } from './cache/next-cache'
import { LocalFileStore } from './files/local-file-store'
import { S3FileStore } from './files/s3-file-store'
import { ConfiguredMailDriver } from './mail'
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
    case 'memory':
      return new NextCacheDriver()
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

export async function currentMailConfig(): Promise<MailConfig> {
  if (env.DEMO_MODE) return NO_MAIL

  const fromEnvironment = mailConfigFromEnvironment(env)
  if (fromEnvironment !== null) return fromEnvironment

  if (env.DATA_SOURCE !== 'postgres') return NO_MAIL

  const overrides = await new PostgresSettingsRepository(getDb()).loadAll()
  return mailConfigFromSettings(SettingsSnapshot.fromOverrides(new Map(overrides)))
}

function buildMail(): MailDriver {
  return new ConfiguredMailDriver(currentMailConfig)
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
