/**
 * Driver implementations. Ports live in `@meith/core`; domain packages depend on
 * those, never on this package (enforced by `domain-no-infra-impl`).
 */

export { currentMailConfig, drivers, resetDriversForTests } from './resolve'

export { MemoryCache } from './cache/memory-cache'
export { NextCacheDriver } from './cache/next-cache'
export { LocalFileStore } from './files/local-file-store'
/*
 * Exported as a *type* only. Importing the class here would statically pull the
 * AWS client into every bundle, which is exactly what the lazy-load
 * condition forbids — `resolve.ts` requires it at runtime instead.
 */
export type { S3FileStore, S3FileStoreConfig, S3Like } from './files/s3-file-store'
export {
  ConfiguredMailDriver,
  HttpMailDriver,
  LogMailDriver,
  MemoryMailDriver,
  SmtpMailDriver,
  createMailDriver,
  formatSender,
} from './mail'
export { MemoryQueue } from './queue/memory-queue'
export { PostgresQueue } from './queue/postgres-queue'
