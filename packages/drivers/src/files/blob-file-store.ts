import {
  ConfigurationError,
  type FileStore,
  type PutFileOptions,
  type StoredFile,
} from '@meith/core'

import { assertUsableKey, encodeKeyPath } from './keys'

export const BLOB_ACCESS = 'private'

export interface BlobFileStoreConfig {
  readonly token: string
}

export interface BlobPutOptions {
  readonly access: typeof BLOB_ACCESS
  readonly token: string
  readonly contentType: string
  readonly addRandomSuffix: boolean
  readonly allowOverwrite: boolean
}

export interface BlobReadOptions {
  readonly access: typeof BLOB_ACCESS
  readonly token: string
}

export interface BlobListOptions {
  readonly token: string
  readonly cursor?: string
}

export interface BlobListPage {
  readonly blobs: readonly { readonly pathname: string }[]
  readonly cursor?: string | undefined
  readonly hasMore: boolean
}

export interface BlobLike {
  put(pathname: string, body: Uint8Array, options: BlobPutOptions): Promise<unknown>
  get(
    pathname: string,
    options: BlobReadOptions,
  ): Promise<{ readonly stream: ReadableStream<Uint8Array> | null } | null>
  del(pathname: string, options: { readonly token: string }): Promise<void>
  list(options: BlobListOptions): Promise<BlobListPage>
}

function isNotFound(error: unknown): boolean {
  if (error === null || typeof error !== 'object') return false
  const named = (error as { constructor?: { name?: string } }).constructor?.name
  const message = (error as { message?: string }).message ?? ''
  return named === 'BlobNotFoundError' || message.includes('The requested blob does not exist')
}

function storeIdFrom(token: string): string {
  const [vendor, product, scope, storeId] = token.split('_')
  if (vendor !== 'vercel' || product !== 'blob' || scope !== 'rw' || !storeId) {
    throw new ConfigurationError(
      'BLOB_READ_WRITE_TOKEN is not a Vercel Blob read-write token. Copy the ' +
        'value the Blob store published, which starts with vercel_blob_rw_.',
    )
  }
  return storeId
}

export class BlobFileStore implements FileStore {
  private readonly storeId: string

  private readonly load: () => Promise<BlobLike>

  private loading: Promise<BlobLike> | undefined

  constructor(
    private readonly config: BlobFileStoreConfig,
    blob?: BlobLike,
  ) {
    this.storeId = storeIdFrom(config.token)
    this.load =
      blob === undefined
        ? async () => (await import('@vercel/blob')) as unknown as BlobLike
        : () => Promise.resolve(blob)
  }

  static fromEnv(env: { BLOB_READ_WRITE_TOKEN?: string | undefined }): BlobFileStore {
    if (!env.BLOB_READ_WRITE_TOKEN) {
      throw new ConfigurationError(
        'FILESTORE_DRIVER=blob requires BLOB_READ_WRITE_TOKEN. A Vercel Blob store ' +
          'attached to the project publishes it. See .env.example.',
      )
    }
    return new BlobFileStore({ token: env.BLOB_READ_WRITE_TOKEN })
  }

  private blob(): Promise<BlobLike> {
    this.loading ??= this.load()
    return this.loading
  }

  async put(key: string, body: Uint8Array, options: PutFileOptions): Promise<StoredFile> {
    assertUsableKey(key)

    const blob = await this.blob()
    await blob.put(key, body, {
      access: BLOB_ACCESS,
      token: this.config.token,
      contentType: options.contentType,
      addRandomSuffix: false,
      allowOverwrite: true,
    })

    return { key, size: body.byteLength, contentType: options.contentType }
  }

  async get(key: string): Promise<Uint8Array | undefined> {
    assertUsableKey(key)

    const blob = await this.blob()
    try {
      const found = await blob.get(key, { access: BLOB_ACCESS, token: this.config.token })
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
      const page = await blob.list({
        token: this.config.token,
        ...(cursor === undefined ? {} : { cursor }),
      })

      for (const entry of page.blobs) yield entry.pathname

      cursor = page.hasMore ? page.cursor : undefined
    } while (cursor !== undefined)
  }

  async delete(key: string): Promise<void> {
    assertUsableKey(key)

    const blob = await this.blob()
    try {
      await blob.del(key, { token: this.config.token })
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
