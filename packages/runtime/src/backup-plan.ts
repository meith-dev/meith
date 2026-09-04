import path from 'node:path'

import {
  type BackupDestination,
  type BackupDestinationEnvironment,
  type BackupDestinationResolution,
  type BackupSchedule,
  type BackupSource,
  type FilestoreDriver,
  parseScheduleTime,
  type RetentionPolicy,
  resolveBackupDestination,
  resolveUploadsMode,
  S3BackupDestination,
  type UploadsMode,
} from '@meith/backup'
import { type Database, migrationUrl, PostgresSettingsRepository } from '@meith/db'
import { BlobFileStore, S3FileStore } from '@meith/drivers'
import { MEITH_VERSION } from '@meith/marketplace'
import { SettingsSnapshot } from '@meith/settings'

export interface BackupEnvironment extends BackupDestinationEnvironment {
  readonly DATABASE_URL?: string | undefined
  readonly DIRECT_DATABASE_URL?: string | undefined
  readonly FILESTORE_DRIVER: FilestoreDriver
  readonly UPLOADS_DIR: string
  readonly BACKUP_DIR: string
  readonly S3_BUCKET?: string | undefined
  readonly S3_REGION?: string | undefined
  readonly S3_ACCESS_KEY_ID?: string | undefined
  readonly S3_SECRET_ACCESS_KEY?: string | undefined
  readonly S3_ENDPOINT?: string | undefined
  readonly S3_PUBLIC_BASE_URL?: string | undefined
  readonly BLOB_READ_WRITE_TOKEN?: string | undefined
  readonly BLOB_STORE_ID?: string | undefined
}

export interface BackupSettingsView {
  readonly schedule: BackupSchedule
  readonly retention: RetentionPolicy
  readonly uploads: UploadsMode
  readonly uploadsPreference: 'auto' | 'include' | 'skip'
  readonly beforeUpgrade: boolean
  readonly destination: BackupDestinationResolution
}

export function backupSettingsFrom(
  snapshot: SettingsSnapshot,
  environment: BackupEnvironment,
): BackupSettingsView {
  const time = parseScheduleTime(snapshot.get('backup.time')) ?? { hour: 2, minute: 0 }
  const frequency = snapshot.get('backup.schedule')
  const preference = snapshot.get('backup.uploads')
  const uploadsPreference =
    preference === 'include' || preference === 'skip' ? preference : ('auto' as const)
  return {
    schedule: {
      frequency: frequency === 'daily' || frequency === 'weekly' ? frequency : 'off',
      hour: time.hour,
      minute: time.minute,
      weekday: Number(snapshot.get('backup.weekday')),
    },
    retention: {
      keep: snapshot.get('backup.keep'),
      keepDays: snapshot.get('backup.keep_days'),
    },
    uploadsPreference,
    uploads: resolveUploadsMode(environment.FILESTORE_DRIVER, uploadsPreference),
    beforeUpgrade: snapshot.get('backup.before_upgrade'),
    destination: resolveBackupDestination({
      environment,
      settings: {
        bucket: snapshot.get('backup.s3_bucket'),
        region: snapshot.get('backup.s3_region'),
        accessKeyId: snapshot.get('backup.s3_access_key_id'),
        secretAccessKey: snapshot.get('backup.s3_secret_access_key'),
        endpoint: snapshot.get('backup.s3_endpoint'),
        prefix: snapshot.get('backup.s3_prefix'),
      },
    }),
  }
}

export async function loadBackupSettings(
  db: Database,
  environment: BackupEnvironment,
): Promise<BackupSettingsView> {
  const overrides = await new PostgresSettingsRepository(db).loadAll()
  return backupSettingsFrom(SettingsSnapshot.fromOverrides(new Map(overrides)), environment)
}

export function backupDestinationFor(
  resolution: BackupDestinationResolution,
): BackupDestination | undefined {
  return resolution.config === null ? undefined : new S3BackupDestination(resolution.config)
}

export function backupSourceFrom(
  environment: BackupEnvironment,
  version: string = MEITH_VERSION,
): BackupSource {
  const databaseVariable =
    environment.DIRECT_DATABASE_URL === undefined ? 'DATABASE_URL' : 'DIRECT_DATABASE_URL'
  const base = {
    databaseUrl: migrationUrl(environment),
    databaseVariable,
    version,
    filestore: environment.FILESTORE_DRIVER,
    uploadsDir: environment.UPLOADS_DIR,
  }

  switch (environment.FILESTORE_DRIVER) {
    case 's3':
      return {
        ...base,
        objectStore: {
          store: S3FileStore.fromEnv(environment),
          origin: `the ${environment.S3_BUCKET} bucket`,
          ...(environment.S3_BUCKET === undefined ? {} : { bucket: environment.S3_BUCKET }),
        },
      }
    case 'blob':
      return {
        ...base,
        objectStore: { store: BlobFileStore.fromEnv(environment), origin: 'the Blob store' },
      }
    default:
      return base
  }
}

export function backupRingDirectory(environment: { readonly BACKUP_DIR: string }): string {
  return path.resolve(environment.BACKUP_DIR)
}
