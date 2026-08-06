import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

import { ConfigurationError, type FileStore, type PutFileOptions, type StoredFile } from '@meith/core'

export interface S3FileStoreConfig {
  readonly bucket: string
  readonly region: string
  readonly accessKeyId: string
  readonly secretAccessKey: string
  readonly endpoint?: string | undefined
  readonly publicBaseUrl?: string | undefined
}

export interface S3Like {
  send(command: unknown): Promise<unknown>
}

function assertUsableKey(key: string): void {
  if (key === '' || key.trim() !== key) {
    throw new ConfigurationError(`Invalid object key: ${JSON.stringify(key)}`)
  }
  if (key.startsWith('/') || key.includes('//')) {
    throw new ConfigurationError(`Object key must not contain empty segments: ${key}`)
  }
  if (key.split('/').some((segment) => segment === '..' || segment === '.')) {
    throw new ConfigurationError(`Object key must not contain relative segments: ${key}`)
  }
  // eslint-disable-next-line no-control-regex -- rejecting control characters is the point
  if (/[\u0000-\u001f\u007f]/.test(key)) {
    throw new ConfigurationError('Object key must not contain control characters.')
  }
}

function isNotFound(error: unknown): boolean {
  const name = (error as { name?: string } | null)?.name
  const status = (error as { $metadata?: { httpStatusCode?: number } } | null)?.$metadata
    ?.httpStatusCode

  return name === 'NoSuchKey' || name === 'NotFound' || status === 404
}

export class S3FileStore implements FileStore {
  private readonly sender: S3Like

  private readonly signingClient: S3Client

  constructor(
    private readonly config: S3FileStoreConfig,
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
        : { endpoint: config.endpoint, forcePathStyle: true }),
    })

    this.sender = sender ?? this.signingClient
  }

  static fromEnv(env: {
    S3_BUCKET?: string | undefined
    S3_REGION?: string | undefined
    S3_ACCESS_KEY_ID?: string | undefined
    S3_SECRET_ACCESS_KEY?: string | undefined
    S3_ENDPOINT?: string | undefined
  }): S3FileStore {
    const missing = (
      ['S3_BUCKET', 'S3_REGION', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const
    ).filter((key) => !env[key])

    if (missing.length > 0) {
      throw new ConfigurationError(
        `FILESTORE_DRIVER=s3 requires ${missing.join(', ')}. See .env.example.`,
      )
    }

    return new S3FileStore({
      bucket: env.S3_BUCKET as string,
      region: env.S3_REGION as string,
      accessKeyId: env.S3_ACCESS_KEY_ID as string,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY as string,
      endpoint: env.S3_ENDPOINT,
    })
  }

  async put(key: string, body: Uint8Array, options: PutFileOptions): Promise<StoredFile> {
    assertUsableKey(key)

    await this.sender.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: body,
        ContentType: options.contentType,
      }),
    )

    return { key, size: body.byteLength, contentType: options.contentType }
  }

  async get(key: string): Promise<Uint8Array | undefined> {
    assertUsableKey(key)

    try {
      const response = (await this.sender.send(
        new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
      )) as { Body?: { transformToByteArray(): Promise<Uint8Array> } }

      if (!response.Body) return undefined
      return await response.Body.transformToByteArray()
    } catch (error) {
      if (isNotFound(error)) return undefined
      throw error
    }
  }

  async delete(key: string): Promise<void> {
    assertUsableKey(key)

    try {
      await this.sender.send(
        new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }),
      )
    } catch (error) {
      if (isNotFound(error)) return
      throw error
    }
  }

  async signedUrl(key: string, expiresInSeconds: number): Promise<string | undefined> {
    assertUsableKey(key)

    if (expiresInSeconds <= 0) {
      throw new ConfigurationError('signedUrl requires a positive expiry.')
    }

    return getSignedUrl(
      this.signingClient,
      new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
      { expiresIn: expiresInSeconds },
    )
  }

  url(key: string): string {
    assertUsableKey(key)

    const base =
      this.config.publicBaseUrl ??
      this.config.endpoint ??
      `https://${this.config.bucket}.s3.${this.config.region}.amazonaws.com`

    return `${base.replace(/\/+$/, '')}/${key}`
  }
}
