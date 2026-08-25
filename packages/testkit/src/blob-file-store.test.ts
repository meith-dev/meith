import { describe, expect, it } from 'vitest'

import { BlobFileStore, type BlobLike } from '@meith/drivers/files/blob-file-store'

import { fileStoreContract } from './driver-contracts'

const TOKEN = 'vercel_blob_rw_store123_secretsecret'

const STORE_ID = 'store_store123'

class FakeNoCredentialsError extends Error {
  constructor() {
    super(
      'Vercel Blob: No blob credentials found. Pass a `token` option, set ' +
        'BLOB_READ_WRITE_TOKEN, or use `oidcToken` (or `VERCEL_OIDC_TOKEN`) with ' +
        '`storeId` or `BLOB_STORE_ID`.',
    )
  }
}

class FakeBlobNotFoundError extends Error {
  constructor() {
    super('Vercel Blob: The requested blob does not exist')
  }
}

function fakeBlob(): BlobLike & {
  objects: Map<string, Uint8Array>
  tokens: (string | undefined)[]
  storeIds: (string | undefined)[]
} {
  const objects = new Map<string, Uint8Array>()
  const tokens: (string | undefined)[] = []
  const storeIds: (string | undefined)[] = []

  function seen(options: { token?: string | undefined; storeId?: string | undefined }): void {
    tokens.push(options.token)
    storeIds.push(options.storeId)
  }

  return {
    objects,
    tokens,
    storeIds,

    put(pathname, body, options) {
      seen(options)
      if (objects.has(pathname) && !options.allowOverwrite) {
        return Promise.reject(new Error('blob already exists'))
      }
      objects.set(pathname, body)
      return Promise.resolve({ pathname })
    },

    get(pathname, options) {
      seen(options)
      const body = objects.get(pathname)
      if (body === undefined) return Promise.reject(new FakeBlobNotFoundError())

      return Promise.resolve({
        stream: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(body)
            controller.close()
          },
        }),
      })
    },

    del(pathname, options) {
      seen(options)
      objects.delete(pathname)
      return Promise.resolve()
    },

    list(options) {
      seen(options)
      const all = [...objects.keys()].sort()
      const start = options.cursor === undefined ? 0 : Number(options.cursor)
      const page = all.slice(start, start + 2)
      const next = start + 2

      return Promise.resolve({
        blobs: page.map((pathname) => ({ pathname })),
        hasMore: next < all.length,
        cursor: next < all.length ? String(next) : undefined,
      })
    },
  }
}

fileStoreContract('BlobFileStore', () => new BlobFileStore({ token: TOKEN }, fakeBlob()))

describe('BlobFileStore specifics', () => {
  const body = new TextEncoder().encode('attachment bytes')

  it('stores every object privately, so an object URL is not a public link', async () => {
    const blob = fakeBlob()
    const store = new BlobFileStore({ token: TOKEN }, blob)
    let seen: string | undefined

    const put = blob.put.bind(blob)
    blob.put = (pathname, bytes, options) => {
      seen = options.access
      return put(pathname, bytes, options)
    }

    await store.put('a.png', body, { contentType: 'image/png', visibility: 'public' })
    expect(seen).toBe('private')
  })

  it('overwrites rather than refusing a repeated key', async () => {
    const store = new BlobFileStore({ token: TOKEN }, fakeBlob())
    await store.put('a.png', body, { contentType: 'image/png', visibility: 'private' })

    await expect(
      store.put('a.png', body, { contentType: 'image/png', visibility: 'private' }),
    ).resolves.toBeDefined()
  })

  it('admits it cannot sign a URL rather than handing back an unsigned one', async () => {
    const store = new BlobFileStore({ token: TOKEN }, fakeBlob())
    expect(await store.signedUrl('a.png', 300)).toBeUndefined()
  })

  it('refuses a non-positive expiry, as the S3 driver does', async () => {
    const store = new BlobFileStore({ token: TOKEN }, fakeBlob())
    await expect(store.signedUrl('a.png', 0)).rejects.toThrow()
  })

  it('builds the object URL on the private host of the store the token names', () => {
    const store = new BlobFileStore({ token: TOKEN }, fakeBlob())
    expect(store.url('a/b.png')).toBe('https://store123.private.blob.vercel-storage.com/a/b.png')
  })

  it('percent-encodes the key, segment by segment', () => {
    const store = new BlobFileStore({ token: TOKEN }, fakeBlob())
    expect(store.url('a/b c#d.png')).toBe(
      'https://store123.private.blob.vercel-storage.com/a/b%20c%23d.png',
    )
  })

  it('walks every page of the store', async () => {
    const blob = fakeBlob()
    const store = new BlobFileStore({ token: TOKEN }, blob)

    for (const key of ['a.png', 'b.png', 'c.png', 'd.png', 'e.png']) {
      await store.put(key, body, { contentType: 'image/png', visibility: 'private' })
    }

    const keys: string[] = []
    for await (const key of store.listKeys()) keys.push(key)

    expect(keys).toEqual(['a.png', 'b.png', 'c.png', 'd.png', 'e.png'])
  })

  it('finishes an empty store without a second request', async () => {
    const store = new BlobFileStore({ token: TOKEN }, fakeBlob())

    const keys: string[] = []
    for await (const key of store.listKeys()) keys.push(key)

    expect(keys).toEqual([])
  })

  describe('key validation', () => {
    it.each([
      ['empty', ''],
      ['leading slash', '/a.png'],
      ['empty segment', 'a//b.png'],
      ['parent segment', 'a/../../etc/passwd'],
      ['current segment', 'a/./b.png'],
      ['untrimmed', ' a.png'],
    ])('rejects a key with %s', async (_label, key) => {
      const store = new BlobFileStore({ token: TOKEN }, fakeBlob())
      await expect(
        store.put(key, body, { contentType: 'image/png', visibility: 'private' }),
      ).rejects.toThrow()
    })

    it('validates on read and delete too, not only on write', async () => {
      const store = new BlobFileStore({ token: TOKEN }, fakeBlob())
      await expect(store.get('/bad')).rejects.toThrow()
      await expect(store.delete('a/../b')).rejects.toThrow()
    })
  })

  describe('fromEnv', () => {
    it('names the variable a Blob store publishes when it is missing', () => {
      expect(() => BlobFileStore.fromEnv({})).toThrow(/BLOB_READ_WRITE_TOKEN/)
    })

    it('refuses a token that is not a Blob read-write token', () => {
      expect(() => BlobFileStore.fromEnv({ BLOB_READ_WRITE_TOKEN: 'nope' })).toThrow(
        /vercel_blob_rw_/,
      )
    })

    it('builds when the environment is complete', () => {
      expect(() => BlobFileStore.fromEnv({ BLOB_READ_WRITE_TOKEN: TOKEN })).not.toThrow()
    })
  })
})

describe('the two credential shapes a Vercel Blob store comes in', () => {
  const body = new TextEncoder().encode('attachment bytes')

  it('sends the read-write token when that is what it was built with', async () => {
    const blob = fakeBlob()
    const store = new BlobFileStore({ token: TOKEN }, blob)

    await store.put('a.png', body, { contentType: 'image/png', visibility: 'private' })

    expect(blob.tokens).toEqual([TOKEN])
    expect(blob.storeIds).toEqual([undefined])
  })

  it('sends the store id as published and no token, so the SDK resolves OIDC itself', async () => {
    const blob = fakeBlob()
    const store = new BlobFileStore({ storeId: STORE_ID }, blob)

    await store.put('a.png', body, { contentType: 'image/png', visibility: 'private' })
    await store.get('a.png')
    await store.delete('a.png')
    for await (const _key of store.listKeys()) break

    expect(blob.tokens).toEqual([undefined, undefined, undefined, undefined])
    expect(blob.storeIds).toEqual([STORE_ID, STORE_ID, STORE_ID, STORE_ID])
  })

  it('strips the store_ prefix, as the SDK does before it signs anything', () => {
    const bare = new BlobFileStore({ storeId: 'store123' }, fakeBlob())
    const prefixed = new BlobFileStore({ storeId: STORE_ID }, fakeBlob())

    expect(prefixed.url('a.png')).toBe(bare.url('a.png'))
  })

  it('builds the same object URL from a store id as from a token', () => {
    const fromToken = new BlobFileStore({ token: TOKEN }, fakeBlob())
    const fromStoreId = new BlobFileStore({ storeId: STORE_ID }, fakeBlob())

    expect(fromStoreId.url('a/b.png')).toBe(fromToken.url('a/b.png'))
  })

  it('explains a missing OIDC token rather than passing the SDK error through', async () => {
    const blob = fakeBlob()
    blob.put = () => Promise.reject(new FakeNoCredentialsError())
    const store = new BlobFileStore({ storeId: STORE_ID }, blob)

    await expect(
      store.put('a.png', body, { contentType: 'image/png', visibility: 'private' }),
    ).rejects.toThrow(/OIDC is turned off for this project, or this is running outside a Vercel/)
  })

  it('names the escape hatch that works in both places', async () => {
    const blob = fakeBlob()
    blob.list = () => Promise.reject(new FakeNoCredentialsError())
    const store = new BlobFileStore({ storeId: STORE_ID }, blob)

    await expect(async () => {
      for await (const _key of store.listKeys()) break
    }).rejects.toThrow(/BLOB_READ_WRITE_TOKEN/)
  })

  it('leaves every other failure alone', async () => {
    const blob = fakeBlob()
    blob.put = () => Promise.reject(new Error('rate limited'))
    const store = new BlobFileStore({ storeId: STORE_ID }, blob)

    await expect(
      store.put('a.png', body, { contentType: 'image/png', visibility: 'private' }),
    ).rejects.toThrow(/rate limited/)
  })
})

describe('fromEnv, against what the integration actually publishes', () => {
  it('builds from the store id alone, which is the shape a linked store gives', () => {
    const store = BlobFileStore.fromEnv({ BLOB_STORE_ID: STORE_ID })
    expect(store.url('a.png')).toContain('store123.')
  })

  it('names both ways in when neither is set', () => {
    expect(() => BlobFileStore.fromEnv({})).toThrow(/BLOB_STORE_ID or BLOB_READ_WRITE_TOKEN/)
  })

  it('prefers OIDC when both name the same store, as the SDK would with no token passed', async () => {
    const blob = fakeBlob()
    const store = BlobFileStore.fromEnv({ BLOB_STORE_ID: STORE_ID, BLOB_READ_WRITE_TOKEN: TOKEN })
    Object.assign(store as unknown as { loading: Promise<BlobLike> }, {
      loading: Promise.resolve(blob),
    })

    await store.delete('a.png')

    expect(blob.tokens).toEqual([undefined])
    expect(blob.storeIds).toEqual([STORE_ID])
  })

  it('uses the token when it names a different store, because that was chosen on purpose', async () => {
    const blob = fakeBlob()
    const store = BlobFileStore.fromEnv({
      BLOB_STORE_ID: 'store_elsewhere',
      BLOB_READ_WRITE_TOKEN: TOKEN,
    })
    Object.assign(store as unknown as { loading: Promise<BlobLike> }, {
      loading: Promise.resolve(blob),
    })

    await store.delete('a.png')

    expect(blob.tokens).toEqual([TOKEN])
    expect(store.url('a.png')).toContain('store123.')
  })

  it('still refuses a token that is not a Blob read-write token', () => {
    expect(() => BlobFileStore.fromEnv({ BLOB_READ_WRITE_TOKEN: 'nope' })).toThrow(
      /vercel_blob_rw_/,
    )
  })
})
