import {
  blobStoreIdFromToken,
  ConfigurationError,
  type FileStore,
  type PutFileOptions,
  type StoredFile,
} from '@meith/core'

import { assertUsableKey, encodeKeyPath } from './keys'

export const BLOB_ACCESS = 'private'

export type BlobFileStoreConfig =
  | { readonly token: string; readonly storeId?: undefined }
  | { readonly storeId: string; readonly token?: undefined }

export type BlobAuthOptions = { readonly token: string } | { readonly storeId: string }

export type BlobPutOptions = BlobAuthOptions & {
  readonly access: typeof BLOB_ACCESS
  readonly contentType: string
  readonly addRandomSuffix: boolean
  readonly allowOverwrite: boolean
}

export type BlobReadOptions = BlobAuthOptions & {
  readonly access: typeof BLOB_ACCESS
  readonly useCache: boolean
}

export type BlobListOptions = BlobAuthOptions & {
  readonly cursor?: string
}

export interface BlobListPage {
  readonly blobs: readonly { readonly pathname: string }[]
  readonly cursor?: string | undefined
  readonly hasMore: boolean
}

export interface BlobLike {
  put(pathname: string, body: Buffer, options: BlobPutOptions): Promise<unknown>
  get(
    pathname: string,
    options: BlobReadOptions,
  ): Promise<{ readonly stream: ReadableStream<Uint8Array> | null } | null>
  del(pathname: string, options: BlobAuthOptions): Promise<void>
  list(options: BlobListOptions): Promise<BlobListPage>
}

function isNotFound(error: unknown): boolean {
  if (error === null || typeof error !== 'object') return false
  const named = (error as { constructor?: { name?: string } }).constructor?.name
  const message = (error as { message?: string }).message ?? ''
  return named === 'BlobNotFoundError' || message.includes('The requested blob does not exist')
}

export const BLOB_NO_CREDENTIALS = 'No blob credentials found'

function normalizeStoreId(storeId: string): string {
  const trimmed = storeId.trim()
  return trimmed.startsWith('store_') ? trimmed.slice('store_'.length) : trimmed
}

function needsCredentials(error: unknown): boolean {
  const message = (error as { message?: string } | null)?.message ?? ''
  return message.includes(BLOB_NO_CREDENTIALS)
}

function storeIdFrom(token: string): string {
  const storeId = blobStoreIdFromToken(token)
  if (storeId === undefined) {
    throw new ConfigurationError(
      'BLOB_READ_WRITE_TOKEN is not a Vercel Blob read-write token. Copy the ' +
        'value the Blob store published, which starts with vercel_blob_rw_.',
    )
  }
  return storeId
}

export class BlobFileStore implements FileStore {
  private readonly storeId: string

  private readonly auth: BlobAuthOptions

  private readonly load: () => Promise<BlobLike>

  private loading: Promise<BlobLike> | undefined

  constructor(config: BlobFileStoreConfig, blob?: BlobLike) {
    this.auth =
      config.token === undefined ? { storeId: config.storeId.trim() } : { token: config.token }
    this.storeId =
      config.token === undefined ? normalizeStoreId(config.storeId) : storeIdFrom(config.token)
    this.load =
      blob === undefined
        ? async () => (await import('@vercel/blob')) satisfies BlobLike
        : () => Promise.resolve(blob)
  }

  static fromEnv(env: {
    BLOB_READ_WRITE_TOKEN?: string | undefined
    BLOB_STORE_ID?: string | undefined
  }): BlobFileStore {
    const token = env.BLOB_READ_WRITE_TOKEN
    const storeId = env.BLOB_STORE_ID

    if (token === undefined && storeId === undefined) {
      throw new ConfigurationError(
        'FILESTORE_DRIVER=blob requires BLOB_STORE_ID or BLOB_READ_WRITE_TOKEN. A ' +
          'Vercel Blob store attached to the project publishes BLOB_STORE_ID, which ' +
          "the board uses with the deployment's OIDC token; a read-write token you " +
          'create on the store yourself is the other way in. See .env.example.',
      )
    }
    if (storeId === undefined) return new BlobFileStore({ token: token as string })
    if (token === undefined) return new BlobFileStore({ storeId })

    return storeIdFrom(token) === normalizeStoreId(storeId)
      ? new BlobFileStore({ storeId })
      : new BlobFileStore({ token })
  }

  private blob(): Promise<BlobLike> {
    this.loading ??= this.load()
    return this.loading
  }

  private async attempt<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation()
    } catch (error) {
      if (!needsCredentials(error) || !('storeId' in this.auth)) throw error
      throw new ConfigurationError(
        `The Blob store ${this.storeId} was reached with no usable credential. ` +
          'BLOB_STORE_ID is set, so the board asked the Vercel SDK to authenticate ' +
          "with the deployment's OIDC token, and the platform supplied none: either " +
          'OIDC is turned off for this project, or this is running outside a Vercel ' +
          'deployment, which a command run on your own machine is. Create a ' +
          'read-write token on the store and set BLOB_READ_WRITE_TOKEN, which works ' +
          'in both places.',
      )
    }
  }

  async put(key: string, body: Uint8Array, options: PutFileOptions): Promise<StoredFile> {
    assertUsableKey(key)

    const blob = await this.blob()
    await this.attempt(() =>
      blob.put(key, Buffer.from(body.buffer, body.byteOffset, body.byteLength), {
        ...this.auth,
        access: BLOB_ACCESS,
        contentType: options.contentType,
        addRandomSuffix: false,
        allowOverwrite: true,
      }),
    )

    return { key, size: body.byteLength, contentType: options.contentType }
  }

  async get(key: string): Promise<Uint8Array | undefined> {
    assertUsableKey(key)

    const blob = await this.blob()
    try {
      const found = await this.attempt(() =>
        blob.get(key, { ...this.auth, access: BLOB_ACCESS, useCache: false }),
      )
      if (found === null || found.stream === null) return undefined
      return new Uint8Array(await new Response(found.stream).arrayBuffer())
    } catch (error) {
      if (isNotFound(error)) return undefined
      throw error
    }
  }

  async *listKeys(): AsyncGenerator<string> {
    const blob = await this.blob()
    let cursor: string | undefined

    do {
      const page = await this.attempt(() =>
        blob.list({ ...this.auth, ...(cursor === undefined ? {} : { cursor }) }),
      )

      for (const entry of page.blobs) yield entry.pathname

      cursor = page.hasMore ? page.cursor : undefined
    } while (cursor !== undefined)
  }

  async delete(key: string): Promise<void> {
    assertUsableKey(key)

    const blob = await this.blob()
    try {
      await this.attempt(() => blob.del(key, { ...this.auth }))
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

    return await Promise.resolve(undefined)
  }

  url(key: string): string {
    assertUsableKey(key)
    return `https://${this.storeId}.${BLOB_ACCESS}.blob.vercel-storage.com/${encodeKeyPath(key)}`
  }
}
