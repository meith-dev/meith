import { createReadStream, createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'

import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

import { ConfigurationError, ValidationError } from '@meith/core'

import { isBundleName } from './bundle'
import { type RetentionPolicy, retentionCandidates } from './retention'
import { WebDavBackupDestination } from './webdav'

export interface RemoteBundle {
  readonly name: string
  readonly size: number
}

export interface RemoteBundleBody {
  readonly body: ReadableStream<Uint8Array>
  readonly size: number | null
}

export interface BackupDestination {
  readonly description: string
  list(): Promise<readonly RemoteBundle[]>
  putFile(name: string, filePath: string, size: number): Promise<void>
  getToFile(name: string, outPath: string): Promise<void>
  open(name: string): Promise<RemoteBundleBody | null>
  delete(name: string): Promise<void>
  prune(policy: RetentionPolicy, now?: Date): Promise<readonly string[]>
  downloadUrl?(name: string, expiresInSeconds: number): Promise<string>
}

export interface S3DestinationConfig {
  readonly kind: 's3'
  readonly bucket: string
  readonly region: string
  readonly accessKeyId: string
  readonly secretAccessKey: string
  readonly endpoint?: string | undefined
  readonly prefix?: string | undefined
}

export interface WebDavDestinationConfig {
  readonly kind: 'webdav'
  readonly url: string
  readonly username: string
  readonly password: string
}

export type BackupDestinationConfig = S3DestinationConfig | WebDavDestinationConfig

export type BackupDestinationKind = BackupDestinationConfig['kind']

export type BackupDestinationSource = 'environment' | 'board' | 'none'

export interface BackupDestinationResolution {
  readonly source: BackupDestinationSource
  readonly config: BackupDestinationConfig | null
  readonly problem: string | null
}

export const BACKUP_DESTINATION_KEYS = [
  'BACKUP_S3_BUCKET',
  'BACKUP_S3_REGION',
  'BACKUP_S3_ACCESS_KEY_ID',
  'BACKUP_S3_SECRET_ACCESS_KEY',
] as const

export const BACKUP_WEBDAV_KEYS = [
  'BACKUP_WEBDAV_URL',
  'BACKUP_WEBDAV_USERNAME',
  'BACKUP_WEBDAV_PASSWORD',
] as const

export type BackupDestinationEnvironment = {
  readonly [K in
    | (typeof BACKUP_DESTINATION_KEYS)[number]
    | (typeof BACKUP_WEBDAV_KEYS)[number]
    | 'BACKUP_S3_ENDPOINT'
    | 'BACKUP_S3_PREFIX']?: string | undefined
}

export function usableWebDavUrl(value: string): string | null {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (url.search !== '' || url.hash !== '') return null
  return url.href.endsWith('/') ? url.href : `${url.href}/`
}

function webDavFromEnv(
  environment: BackupDestinationEnvironment,
): WebDavDestinationConfig | undefined {
  const url = environment.BACKUP_WEBDAV_URL
  const username = environment.BACKUP_WEBDAV_USERNAME ?? ''
  const password = environment.BACKUP_WEBDAV_PASSWORD ?? ''
  if (url === undefined || url === '') {
    if (username !== '' || password !== '') {
      throw new ConfigurationError(
        'BACKUP_WEBDAV_USERNAME or BACKUP_WEBDAV_PASSWORD is set without BACKUP_WEBDAV_URL.',
      )
    }
    return undefined
  }
  const usable = usableWebDavUrl(url)
  if (usable === null) {
    throw new ConfigurationError(
      'BACKUP_WEBDAV_URL must be an http:// or https:// address of a collection, ' +
        'with no query string.',
    )
  }
  if ((username === '') !== (password === '')) {
    throw new ConfigurationError(
      'BACKUP_WEBDAV_USERNAME and BACKUP_WEBDAV_PASSWORD are set together, or not at all.',
    )
  }
  return { kind: 'webdav', url: usable, username, password }
}

function normalisePrefix(raw: string | undefined): string | undefined {
  const prefix = raw?.replace(/^\/+|\/+$/g, '')
  if (prefix === undefined || prefix === '') return undefined
  if (
    prefix.split('/').some((segment) => !/^[\w!.*'()-]+$/.test(segment) || /^\.+$/.test(segment))
  ) {
    throw new ConfigurationError(
      'The backup prefix must be one or more path segments of unreserved characters.',
    )
  }
  return prefix
}

export function backupDestinationFromEnv(
  environment: BackupDestinationEnvironment,
): BackupDestinationConfig | undefined {
  const set = BACKUP_DESTINATION_KEYS.filter(
    (key) => environment[key] !== undefined && environment[key] !== '',
  )
  if (set.length === 0) return webDavFromEnv(environment)
  if (set.length < BACKUP_DESTINATION_KEYS.length) {
    const missing = BACKUP_DESTINATION_KEYS.filter((key) => !set.includes(key))
    throw new ConfigurationError(
      `An off-site backup destination is partly configured: ${set.join(', ')} without ` +
        `${missing.join(', ')}. Set all four, or none.`,
    )
  }

  if (webDavFromEnv(environment) !== undefined) {
    throw new ConfigurationError(
      'Both BACKUP_S3_* and BACKUP_WEBDAV_* are set. A board ships its bundles to one ' +
        'destination; unset one of the two.',
    )
  }

  return {
    kind: 's3',
    bucket: environment.BACKUP_S3_BUCKET as string,
    region: environment.BACKUP_S3_REGION as string,
    accessKeyId: environment.BACKUP_S3_ACCESS_KEY_ID as string,
    secretAccessKey: environment.BACKUP_S3_SECRET_ACCESS_KEY as string,
    endpoint: environment.BACKUP_S3_ENDPOINT || undefined,
    prefix: normalisePrefix(environment.BACKUP_S3_PREFIX),
  }
}

export interface BackupDestinationSettings {
  readonly kind: 'none' | 's3' | 'webdav'
  readonly bucket: string
  readonly region: string
  readonly accessKeyId: string
  readonly secretAccessKey: string
  readonly endpoint: string
  readonly prefix: string
  readonly webdavUrl: string
  readonly webdavUsername: string
  readonly webdavPassword: string
}

function webDavFromSettings(settings: BackupDestinationSettings): BackupDestinationResolution {
  const url = usableWebDavUrl(settings.webdavUrl)
  if (settings.webdavUrl.trim() === '') {
    return { source: 'board', config: null, problem: 'The WebDAV destination has no address.' }
  }
  if (url === null) {
    return {
      source: 'board',
      config: null,
      problem:
        'The WebDAV address must be an http:// or https:// address of a folder, with no ' +
        'query string.',
    }
  }
  const username = settings.webdavUsername.trim()
  if ((username === '') !== (settings.webdavPassword === '')) {
    return {
      source: 'board',
      config: null,
      problem: 'The WebDAV username and password go together: fill in both, or neither.',
    }
  }
  return {
    source: 'board',
    config: { kind: 'webdav', url, username, password: settings.webdavPassword },
    problem: null,
  }
}

export function backupDestinationFromSettings(
  settings: BackupDestinationSettings,
): BackupDestinationResolution {
  if (settings.kind === 'none') return { source: 'none', config: null, problem: null }
  if (settings.kind === 'webdav') return webDavFromSettings(settings)

  const bucket = settings.bucket.trim()
  if (bucket === '') {
    return { source: 'board', config: null, problem: 'The S3 destination names no bucket.' }
  }

  const missing: string[] = []
  if (settings.region.trim() === '') missing.push('a region')
  if (settings.accessKeyId.trim() === '') missing.push('an access key id')
  if (settings.secretAccessKey === '') missing.push('a secret access key')
  if (missing.length > 0) {
    return {
      source: 'board',
      config: null,
      problem: `The destination names the ${bucket} bucket without ${missing.join(', ')}.`,
    }
  }

  try {
    return {
      source: 'board',
      config: {
        kind: 's3',
        bucket,
        region: settings.region.trim(),
        accessKeyId: settings.accessKeyId.trim(),
        secretAccessKey: settings.secretAccessKey,
        endpoint: settings.endpoint.trim() === '' ? undefined : settings.endpoint.trim(),
        prefix: normalisePrefix(settings.prefix),
      },
      problem: null,
    }
  } catch (error) {
    return {
      source: 'board',
      config: null,
      problem: error instanceof Error ? error.message : String(error),
    }
  }
}

export function resolveBackupDestination(input: {
  readonly environment: BackupDestinationEnvironment
  readonly settings: BackupDestinationSettings | null
}): BackupDestinationResolution {
  try {
    const fromEnvironment = backupDestinationFromEnv(input.environment)
    if (fromEnvironment !== undefined) {
      return { source: 'environment', config: fromEnvironment, problem: null }
    }
  } catch (error) {
    return {
      source: 'environment',
      config: null,
      problem: error instanceof Error ? error.message : String(error),
    }
  }

  if (input.settings === null) return { source: 'none', config: null, problem: null }
  return backupDestinationFromSettings(input.settings)
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

export class S3BackupDestination implements BackupDestination {
  private readonly sender: S3Like

  private readonly signingClient: S3Client

  constructor(
    private readonly config: S3DestinationConfig,
    sender?: S3Like,
  ) {
    this.signingClient = new S3Client({
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
    this.sender = sender ?? this.signingClient
  }

  get description(): string {
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
          `${this.description} has no bundle named ${name}. meith backup:list names what it holds.`,
        )
      }
      throw error
    }
    if (response.Body === undefined) {
      throw new ConfigurationError(`${this.description} answered without a body for ${name}.`)
    }
    await pipeline(response.Body, createWriteStream(outPath, { mode: 0o600 }))
  }

  async open(name: string): Promise<RemoteBundleBody | null> {
    let response: {
      Body?: { transformToWebStream(): ReadableStream<Uint8Array> }
      ContentLength?: number
    }
    try {
      response = (await this.sender.send(
        new GetObjectCommand({ Bucket: this.config.bucket, Key: this.key(name) }),
      )) as typeof response
    } catch (error) {
      if (isNotFound(error)) return null
      throw error
    }
    if (response.Body === undefined) return null
    return { body: response.Body.transformToWebStream(), size: response.ContentLength ?? null }
  }

  async delete(name: string): Promise<void> {
    await this.sender.send(
      new DeleteObjectCommand({ Bucket: this.config.bucket, Key: this.key(name) }),
    )
  }

  async prune(policy: RetentionPolicy, now: Date = new Date()): Promise<readonly string[]> {
    const stale = retentionCandidates(
      (await this.list()).map((bundle) => bundle.name),
      policy,
      now,
    )
    for (const name of stale) await this.delete(name)
    return stale
  }

  async downloadUrl(name: string, expiresInSeconds: number): Promise<string> {
    return getSignedUrl(
      this.signingClient,
      new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: this.key(name),
        ResponseContentDisposition: `attachment; filename="${name}"`,
      }),
      { expiresIn: expiresInSeconds },
    )
  }
}

export function openBackupDestination(config: BackupDestinationConfig): BackupDestination {
  return config.kind === 'webdav'
    ? new WebDavBackupDestination(config)
    : new S3BackupDestination(config)
}
