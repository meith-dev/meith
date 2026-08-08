/**
 * S3-compatible object storage.
 *
 * This module is loaded **lazily**, only when `FILESTORE_DRIVER=s3` — see
 * `resolve.ts`. That is the condition the dependency was accepted on: a
 * board running on local disk must never pull the AWS client into its bundle.
 * A static import here would defeat it, so the import below is the reason this
 * file exists separately at all.
 *
 * Written against the S3 API rather than AWS specifically. R2, B2, MinIO and
 * Spaces all speak it, and `endpoint` + `forcePathStyle` are what they need —
 * which is why neither is optional in spirit even though both are in the type.
 */
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
  /** Set for any non-AWS S3 implementation (R2, MinIO, Spaces). */
  readonly endpoint?: string | undefined
  /**
   * Public base URL for `visibility: 'public'` objects, e.g. a CDN in front of
   * the bucket. Falls back to the endpoint, which is only correct if the bucket
   * is genuinely public.
   */
  readonly publicBaseUrl?: string | undefined
}

/**
 * The slice of the SDK client this store uses.
 *
 * Declared structurally so tests can supply a fake and run the F05 contract
 * suite against *this* code — the key handling, the error mapping, the
 * byte round-trip — without a network or a live bucket. Testing through the
 * real client would only re-test the SDK.
 */
export interface S3Like {
  send(command: unknown): Promise<unknown>
}

/**
 * Object keys are partly user-influenced (attachment filenames), so they are
 * constrained rather than trusted.
 *
 * A leading slash produces a key with an empty first path segment, which most
 * consoles then display as an unnavigable folder; `..` is meaningless to S3 but
 * becomes a traversal the moment anything mirrors these keys onto a disk — which
 * `LocalFileStore` does, and which the importer (F85) will.
 */
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
  /*
   * Written as escapes, never as raw bytes — guard R0 bans literal control
   * characters in source, and it caught this line. A raw range here reads as
   * an empty character class in every editor and diff.
   */
  // eslint-disable-next-line no-control-regex -- rejecting control characters is the point
  if (/[\u0000-\u001f\u007f]/.test(key)) {
    throw new ConfigurationError('Object key must not contain control characters.')
  }
}

/** S3 reports a missing object in more than one shape depending on the caller. */
function isNotFound(error: unknown): boolean {
  const name = (error as { name?: string } | null)?.name
  const status = (error as { $metadata?: { httpStatusCode?: number } } | null)?.$metadata
    ?.httpStatusCode

  return name === 'NoSuchKey' || name === 'NotFound' || status === 404
}

export class S3FileStore implements FileStore {
  /** Issues the object commands. Replaceable, so tests can drive this offline. */
  private readonly sender: S3Like

  /**
   * Used *only* for presigning, which needs the SDK client's own resolved
   * config (endpoint provider, credentials, signer) and cannot work against an
   * arbitrary stand-in.
   *
   * Constructing it is free and opens no connection — presigning is local
   * crypto — so a test can inject a fake `sender` and still exercise real
   * signature generation rather than mocking the one thing this dependency was taken
   * dependency for.
   */
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
        : // Path-style addressing: virtual-host style requires DNS per bucket,
          // which self-hosted MinIO and most compatible stores do not provide.
          { endpoint: config.endpoint, forcePathStyle: true }),
    })

    this.sender = sender ?? this.signingClient
  }

  /** Build from the validated environment. Throws with the missing name. */
  static fromEnv(env: {
    S3_BUCKET?: string | undefined
    S3_REGION?: string | undefined
    S3_ACCESS_KEY_ID?: string | undefined
    S3_SECRET_ACCESS_KEY?: string | undefined
    S3_ENDPOINT?: string | undefined
  }): S3FileStore {
    /*
     * F02's schema already requires these when FILESTORE_DRIVER=s3, so reaching
     * here without them is a bug in that schema rather than operator error —
     * but failing with the variable's name beats a null dereference inside the
     * SDK three frames down.
     */
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

    /*
     * No ACL is set, deliberately. R2 and several other compatible stores reject
     * `ACL: public-read` outright, and on AWS most buckets now have ACLs
     * disabled by default. Public access is a property of the bucket policy or
     * the CDN in front of it, which is also the only arrangement that works
     * across every provider this is meant to support.
     */
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
      // A miss is `undefined`, never a throw: the port's contract, and what
      // every caller's "not found → 404" path depends on.
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
      /*
       * S3 treats deleting a missing key as success, but a compatible store may
       * not. Orphan cleanup (F42) runs repeatedly over the same keys, so this
       * has to be idempotent whatever the provider does.
       */
      if (isNotFound(error)) return
      throw error
    }
  }

  /**
   * A time-limited URL for a private object.
   *
   * This is what F42 relies on so an attachment in a forum the actor cannot see
   * is not downloadable by direct URL: the app checks permission, then mints a
   * short-lived signature. An unsigned public URL here would hand out every
   * attachment on the board to anyone who can guess a key.
   */
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

  /** Stable public URL. Only meaningful for objects stored as public. */
  url(key: string): string {
    assertUsableKey(key)

    const base =
      this.config.publicBaseUrl ??
      this.config.endpoint ??
      `https://${this.config.bucket}.s3.${this.config.region}.amazonaws.com`

    return `${base.replace(/\/+$/, '')}/${key}`
  }
}
