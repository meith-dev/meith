/**
 * `S3FileStore` against the file-store contract, plus the behaviour singled
 * out as the reason for taking the dependency at all.
 *
 * Driven through a fake S3 client rather than a live bucket. That is a
 * deliberate line: the point is to test *this* code — key handling, error
 * mapping, the byte round-trip, the miss-is-undefined contract — not to re-test
 * the AWS SDK. What a fake cannot prove is that the SDK talks to a real bucket
 * correctly, which is what an integration job against MinIO would be for; it is
 * recorded as a gap rather than pretended away.
 */
import { S3FileStore, type S3Like } from '@meith/drivers/files/s3-file-store'
import { describe, expect, it } from 'vitest'

import { fileStoreContract } from './driver-contracts'

/**
 * Minimal in-memory S3. Recognises the commands the store issues by their
 * constructor name, which is how the real client dispatches too.
 */
function fakeS3(): S3Like & { objects: Map<string, Uint8Array> } {
  const objects = new Map<string, Uint8Array>()

  return {
    objects,
    async send(command: unknown) {
      const name = (command as { constructor: { name: string } }).constructor.name
      const input = (command as { input: Record<string, string & Uint8Array> }).input
      const key = input.Key as unknown as string

      if (name === 'PutObjectCommand') {
        objects.set(key, input.Body as unknown as Uint8Array)
        return {}
      }

      if (name === 'GetObjectCommand') {
        const body = objects.get(key)
        if (!body) {
          // The shape the SDK actually throws, so the store's error mapping is
          // exercised rather than bypassed.
          throw Object.assign(new Error('NoSuchKey'), {
            name: 'NoSuchKey',
            $metadata: { httpStatusCode: 404 },
          })
        }
        return { Body: { transformToByteArray: async () => body } }
      }

      if (name === 'DeleteObjectCommand') {
        objects.delete(key)
        return {}
      }

      throw new Error(`fakeS3: unhandled command ${name}`)
    },
  }
}

const CONFIG = {
  bucket: 'community-uploads',
  region: 'eu-west-2',
  accessKeyId: 'AKIA-test',
  secretAccessKey: 'secret-test',
}

/* The shared F05 contract, exactly as LocalFileStore runs it. */
fileStoreContract('S3FileStore', () => new S3FileStore(CONFIG, fakeS3()))

describe('S3FileStore specifics', () => {
  const body = new TextEncoder().encode('attachment bytes')

  /*
   * This was the reason for taking the SDK rather than
   * hand-rolling SigV4: F42 needs "an attachment in a community the actor cannot
   * view is not downloadable by direct URL". The app checks permission, then
   * mints a short-lived signature — an unsigned URL here would hand out every
   * attachment on the board to anyone who can guess a key.
   */
  it('signs a private URL rather than returning a bare one', async () => {
    const store = new S3FileStore(CONFIG, fakeS3())
    const signed = await store.signedUrl('a/private.png', 300)

    expect(signed).toBeDefined()
    expect(signed).toContain('X-Amz-Signature=')
    expect(signed).toContain('X-Amz-Expires=300')
  })

  it('refuses a non-positive expiry, which would sign a URL valid forever', async () => {
    const store = new S3FileStore(CONFIG, fakeS3())
    await expect(store.signedUrl('a.png', 0)).rejects.toThrow()
  })

  it('builds a public URL from the configured base', () => {
    const store = new S3FileStore(
      { ...CONFIG, publicBaseUrl: 'https://cdn.example/' },
      fakeS3(),
    )
    // Trailing slash on the base must not produce a double slash.
    expect(store.url('a/b.png')).toBe('https://cdn.example/a/b.png')
  })

  it('falls back to the bucket URL when no public base is configured', () => {
    expect(new S3FileStore(CONFIG, fakeS3()).url('a.png')).toBe(
      'https://community-uploads.s3.eu-west-2.amazonaws.com/a.png',
    )
  })

  describe('key validation', () => {
    /*
     * Keys are partly user-influenced (attachment filenames). `..` means
     * nothing to S3, but it becomes a real traversal the moment anything
     * mirrors these keys onto a disk — which LocalFileStore does today and the
     * importer will (F85).
     */
    it.each([
      ['empty', ''],
      ['leading slash', '/a.png'],
      ['empty segment', 'a//b.png'],
      ['parent segment', 'a/../../etc/passwd'],
      ['current segment', 'a/./b.png'],
      ['untrimmed', ' a.png'],
    ])('rejects a key with %s', async (_label, key) => {
      const store = new S3FileStore(CONFIG, fakeS3())
      await expect(
        store.put(key, body, { contentType: 'image/png', visibility: 'private' }),
      ).rejects.toThrow()
    })

    it('accepts an ordinary nested key', async () => {
      const store = new S3FileStore(CONFIG, fakeS3())
      await expect(
        store.put('2026/07/a-b_c.png', body, {
          contentType: 'image/png',
          visibility: 'private',
        }),
      ).resolves.toBeDefined()
    })

    it('validates on read and delete too, not only on write', async () => {
      const store = new S3FileStore(CONFIG, fakeS3())
      await expect(store.get('/bad')).rejects.toThrow()
      await expect(store.delete('a/../b')).rejects.toThrow()
    })
  })

  describe('fromEnv', () => {
    it('names every missing variable at once', () => {
      expect(() => S3FileStore.fromEnv({ S3_BUCKET: 'b' })).toThrow(
        /S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY/,
      )
    })

    it('builds when the environment is complete', () => {
      expect(() =>
        S3FileStore.fromEnv({
          S3_BUCKET: 'b',
          S3_REGION: 'r',
          S3_ACCESS_KEY_ID: 'k',
          S3_SECRET_ACCESS_KEY: 's',
        }),
      ).not.toThrow()
    })
  })
})
