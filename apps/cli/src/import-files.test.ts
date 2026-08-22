import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { beforeEach, describe, expect, it } from 'vitest'

import type { ImageProcessor } from '@meith/attachments'
import type { FileStore, PutFileOptions, StoredFile } from '@meith/core'

import { UploadsDirCopier } from './import-files'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 1, 2, 3])

class MemoryStore implements FileStore {
  readonly stored = new Map<string, { bytes: Uint8Array; options: PutFileOptions }>()

  async put(key: string, body: Uint8Array, options: PutFileOptions): Promise<StoredFile> {
    this.stored.set(key, { bytes: body, options })
    return { key, size: body.byteLength, contentType: options.contentType }
  }

  async get(key: string): Promise<Uint8Array | undefined> {
    return this.stored.get(key)?.bytes
  }

  async delete(): Promise<void> {}

  signedUrl(): Promise<string | undefined> {
    return Promise.resolve(undefined)
  }

  url(key: string): string {
    return `/uploads/${key}`
  }
}

const stubImages: ImageProcessor = {
  async process(input) {
    return {
      bytes: input.bytes,
      contentType: input.codec === 'png' ? 'image/png' : 'image/jpeg',
      width: 640,
      height: 480,
      ...(input.thumbnail === false
        ? {}
        : { thumbnail: { bytes: new Uint8Array([9]), contentType: 'image/jpeg' } }),
    }
  },
}

let root: string
let store: MemoryStore
let copier: UploadsDirCopier

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'meith-import-'))
  store = new MemoryStore()
  copier = new UploadsDirCopier(root, store, stubImages)
})

const attachmentInput = (path: string, legacyId = 9) => ({
  legacyId,
  path,
  thumbnailPath: null,
  filename: 'file.bin',
  contentType: null,
})

describe('copying attachments', () => {
  it('reports a file the uploads directory does not have', async () => {
    const result = await copier.attachment(attachmentInput('missing.attach'))
    expect(result).toMatchObject({ outcome: 'missing' })
  })

  it('stores an opaque file as it is', async () => {
    await writeFile(join(root, 'doc.attach'), PDF)
    const result = await copier.attachment(attachmentInput('doc.attach'))

    expect(result).toMatchObject({
      outcome: 'ready',
      storageKey: 'import/attachments/9.pdf',
      contentType: 'application/pdf',
    })
    expect(store.stored.get('import/attachments/9.pdf')?.options.visibility).toBe('private')
  })

  it('re-encodes an image and stores its thumbnail', async () => {
    await writeFile(join(root, 'photo.attach'), PNG)
    const result = await copier.attachment(attachmentInput('photo.attach'))

    expect(result).toMatchObject({
      outcome: 'ready',
      storageKey: 'import/attachments/9.png',
      thumbnailKey: 'import/attachments/9.thumb.jpg',
      width: 640,
      height: 480,
    })
    expect(store.stored.has('import/attachments/9.thumb.jpg')).toBe(true)
  })

  it('refuses a file type the board does not accept', async () => {
    await writeFile(join(root, 'script.attach'), new Uint8Array([0x4d, 0x5a, 1, 2]))
    const result = await copier.attachment(attachmentInput('script.attach'))
    expect(result).toMatchObject({ outcome: 'failed' })
  })

  it('never follows a path out of the uploads directory', async () => {
    const result = await copier.attachment(attachmentInput('../../etc/passwd'))
    expect(result).toMatchObject({ outcome: 'missing' })
  })
})

describe('copying avatars', () => {
  it('fits, stores and measures an avatar', async () => {
    await mkdir(join(root, 'avatars'), { recursive: true })
    await writeFile(join(root, 'avatars', 'avatar_5.png'), PNG)

    const result = await copier.avatar({ legacyUserId: 5, path: 'avatars/avatar_5.png' })
    expect(result).toMatchObject({ outcome: 'ready', key: 'import/avatars/5.png', width: 640 })
    expect(store.stored.get('import/avatars/5.png')?.options.visibility).toBe('public')
  })

  it('finds a salted phpBB avatar through the glob', async () => {
    await mkdir(join(root, 'images/avatars/upload'), { recursive: true })
    await writeFile(join(root, 'images/avatars/upload', 'x7f2_5.png'), PNG)

    const result = await copier.avatar({
      legacyUserId: 5,
      path: 'images/avatars/upload/*_5.png',
    })
    expect(result).toMatchObject({ outcome: 'ready' })
  })

  it('refuses a non-image avatar', async () => {
    await writeFile(join(root, 'a.png'), PDF)
    const result = await copier.avatar({ legacyUserId: 5, path: 'a.png' })
    expect(result).toMatchObject({ outcome: 'failed' })
  })
})
