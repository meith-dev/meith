import { createReadStream, createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'

import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'

import { ConfigurationError, ValidationError } from '@meith/core'

export const BUNDLE_NAME_PATTERN = /^meith-backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z\.tar\.gz$/

export function isBundleName(name: string): boolean {
  return BUNDLE_NAME_PATTERN.test(name)
}

export function pruneCandidates(names: readonly string[], keep: number): readonly string[] {
  return names
    .filter((name) => isBundleName(name))
    .sort()
    .reverse()
    .slice(keep)
}

export const DEFAULT_KEEP = 7

export function resolveKeep(flag: string | undefined): number {
  if (flag === undefined) return DEFAULT_KEEP
  if (!/^\d+$/.test(flag) || Number(flag) < 1 || !Number.isSafeInteger(Number(flag))) {
    throw new ValidationError(`--keep must be a whole number of bundles, 1 or more, got "${flag}".`)
  }
  return Number(flag)
}

export interface BackupDestinationConfig {
  readonly bucket: string
  readonly region: string
  readonly accessKeyId: string
  readonly secretAccessKey: string
  readonly endpoint?: string | undefined
  readonly prefix?: string | undefined
}

const BACKUP_DESTINATION_KEYS = [
  'BACKUP_S3_BUCKET',
  'BACKUP_S3_REGION',
  'BACKUP_S3_ACCESS_KEY_ID',
  'BACKUP_S3_SECRET_ACCESS_KEY',
] as const

export function backupDestinationFromEnv(
  environment: NodeJS.ProcessEnv,
): BackupDestinationConfig | undefined {
  const set = BACKUP_DESTINATION_KEYS.filter(
    (key) => environment[key] !== undefined && environment[key] !== '',
  )
  if (set.length === 0) return undefined
  if (set.length < BACKUP_DESTINATION_KEYS.length) {
    const missing = BACKUP_DESTINATION_KEYS.filter((key) => !set.includes(key))
    throw new ConfigurationError(
      `An off-site backup destination is partly configured: ${set.join(', ')} without ` +
        `${missing.join(', ')}. Set all four, or none.`,
    )
  }

  const prefix = environment.BACKUP_S3_PREFIX?.replace(/^\/+|\/+$/g, '')
  if (
    prefix !== undefined &&
    prefix !== '' &&
    prefix.split('/').some((segment) => !/^[\w!.*'()-]+$/.test(segment) || /^\.+$/.test(segment))
  ) {
    throw new ConfigurationError(
      'BACKUP_S3_PREFIX must be one or more path segments of unreserved characters.',
    )
  }

  return {
    bucket: environment.BACKUP_S3_BUCKET as string,
    region: environment.BACKUP_S3_REGION as string,
    accessKeyId: environment.BACKUP_S3_ACCESS_KEY_ID as string,
    secretAccessKey: environment.BACKUP_S3_SECRET_ACCESS_KEY as string,
    endpoint: environment.BACKUP_S3_ENDPOINT || undefined,
    prefix: prefix === '' ? undefined : prefix,
  }
}

export interface S3Like {
  send(command: unknown): Promise<unknown>
}

function isNotFound(error: unknown): boolean {
  const name = (error as { name?: string } | null)?.name
  const status = (error as { $metadata?: { httpStatusCode?: number } } | null)?.$metadata
    ?.httpStatusCode

  return name === 'NoSuchKey' || name === 'NotFound' || status === 404
}

export interface RemoteBundle {
  readonly name: string
  readonly size: number
}

export class BackupStore {
  private readonly sender: S3Like

  constructor(
    private readonly config: BackupDestinationConfig,
    sender?: S3Like,
  ) {
    this.sender =
      sender ??
      new S3Client({
        region: config.region,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
        ...(config.endpoint === undefined
          ? {}
          : ({
              endpoint: config.endpoint,
              forcePathStyle: true,
              requestChecksumCalculation: 'WHEN_REQUIRED',
            } as const)),
      })
  }

  get destination(): string {
    return this.config.prefix === undefined
      ? `the ${this.config.bucket} bucket`
      : `the ${this.config.bucket} bucket under ${this.config.prefix}/`
  }

  private key(name: string): string {
    if (!isBundleName(name)) {
      throw new ValidationError(`Not a backup bundle name: ${JSON.stringify(name)}`)
    }
    return this.config.prefix === undefined ? name : `${this.config.prefix}/${name}`
  }

  async putFile(name: string, filePath: string, size: number): Promise<void> {
    await this.sender.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: this.key(name),
        Body: createReadStream(filePath),
        ContentLength: size,
        ContentType: 'application/gzip',
      }),
    )
  }

  async list(): Promise<readonly RemoteBundle[]> {
    const prefix = this.config.prefix === undefined ? '' : `${this.config.prefix}/`
    const bundles: RemoteBundle[] = []
    let continuationToken: string | undefined

    do {
      const response = (await this.sender.send(
        new ListObjectsV2Command({
          Bucket: this.config.bucket,
          ...(prefix === '' ? {} : { Prefix: prefix }),
          ...(continuationToken === undefined ? {} : { ContinuationToken: continuationToken }),
        }),
      )) as {
        Contents?: readonly { Key?: string; Size?: number }[]
        IsTruncated?: boolean
        NextContinuationToken?: string
      }

      for (const object of response.Contents ?? []) {
        if (object.Key === undefined || !object.Key.startsWith(prefix)) continue
        const name = object.Key.slice(prefix.length)
        if (isBundleName(name)) bundles.push({ name, size: object.Size ?? 0 })
      }

      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined
    } while (continuationToken !== undefined)

    return bundles.sort((a, b) => a.name.localeCompare(b.name))
  }

  async getToFile(name: string, outPath: string): Promise<void> {
    let response: { Body?: NodeJS.ReadableStream }
    try {
      response = (await this.sender.send(
        new GetObjectCommand({ Bucket: this.config.bucket, Key: this.key(name) }),
      )) as { Body?: NodeJS.ReadableStream }
    } catch (error) {
      if (isNotFound(error)) {
        throw new ValidationError(
          `${this.destination} has no bundle named ${name}. meith backup:list names what it holds.`,
        )
      }
      throw error
    }
    if (response.Body === undefined) {
      throw new ConfigurationError(`${this.destination} answered without a body for ${name}.`)
    }
    await pipeline(response.Body, createWriteStream(outPath, { mode: 0o600 }))
  }

  async delete(name: string): Promise<void> {
    await this.sender.send(
      new DeleteObjectCommand({ Bucket: this.config.bucket, Key: this.key(name) }),
    )
  }

  async prune(keep: number): Promise<readonly string[]> {
    const stale = pruneCandidates(
      (await this.list()).map((bundle) => bundle.name),
      keep,
    )
    for (const name of stale) await this.delete(name)
    return stale
  }
}
