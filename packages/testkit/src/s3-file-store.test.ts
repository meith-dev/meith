import { describe, expect, it } from 'vitest'

import { S3FileStore, type S3Like } from '@meith/drivers/files/s3-file-store'

import { fileStoreContract } from './driver-contracts'

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
  bucket: 'forum-uploads',
  region: 'eu-west-2',
  accessKeyId: 'AKIA-test',
  secretAccessKey: 'secret-test',
}

fileStoreContract('S3FileStore', () => new S3FileStore(CONFIG, fakeS3()))

describe('S3FileStore specifics', () => {
  const body = new TextEncoder().encode('attachment bytes')

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
    const store = new S3FileStore({ ...CONFIG, publicBaseUrl: 'https://cdn.example/' }, fakeS3())
    expect(store.url('a/b.png')).toBe('https://cdn.example/a/b.png')
  })

  it('falls back to the bucket URL when no public base is configured', () => {
    expect(new S3FileStore(CONFIG, fakeS3()).url('a.png')).toBe(
      'https://forum-uploads.s3.eu-west-2.amazonaws.com/a.png',
    )
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
