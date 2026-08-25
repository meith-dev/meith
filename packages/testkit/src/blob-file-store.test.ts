import { describe, expect, it } from 'vitest'

import { BlobFileStore, type BlobLike } from '@meith/drivers/files/blob-file-store'

import { fileStoreContract } from './driver-contracts'

const TOKEN = 'vercel_blob_rw_store123_secretsecret'

class FakeBlobNotFoundError extends Error {
  constructor() {
    super('Vercel Blob: The requested blob does not exist')
  }
}

function fakeBlob(): BlobLike & { objects: Map<string, Uint8Array>; tokens: string[] } {
  const objects = new Map<string, Uint8Array>()
  const tokens: string[] = []

  return {
    objects,
    tokens,

    put(pathname, body, options) {
      tokens.push(options.token)
      if (objects.has(pathname) && !options.allowOverwrite) {
        return Promise.reject(new Error('blob already exists'))
      }
      objects.set(pathname, body)
      return Promise.resolve({ pathname })
    },

    get(pathname, options) {
      tokens.push(options.token)
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
      tokens.push(options.token)
      objects.delete(pathname)
      return Promise.resolve()
    },

    list(options) {
      tokens.push(options.token)
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
