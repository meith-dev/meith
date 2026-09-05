import { readdir, readFile } from 'node:fs/promises'
import { basename, dirname, join, normalize, resolve, sep } from 'node:path'

import { type AttachmentType, type ImageProcessor, sniff } from '@meith/attachments'
import { AVATAR_BOX } from '@meith/avatars'
import type { FileStore } from '@meith/core'
import type { CopiedAttachment, CopiedAvatar, ImportFileCopier } from '@meith/db'
import { imageProcessor } from '@meith/drivers/images'

const EXTENSIONS: Readonly<Record<string, string>> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'application/pdf': '.pdf',
  'application/zip': '.zip',
}

export class UploadsDirCopier implements ImportFileCopier {
  private readonly root: string

  constructor(
    root: string,
    private readonly files: FileStore,
    private readonly images: ImageProcessor = imageProcessor,
  ) {
    this.root = resolve(root)
  }

  async attachment(input: {
    readonly legacyId: number
    readonly path: string
    readonly thumbnailPath: string | null
    readonly filename: string
    readonly contentType: string | null
  }): Promise<CopiedAttachment> {
    const bytes = await this.#read(input.path)
    if (bytes === null) {
      return { outcome: 'missing', reason: `file ${input.path} missing from uploads directory` }
    }

    const type = sniff(bytes)
    if (type === undefined) {
      return {
        outcome: 'failed',
        reason: `file ${input.path} is not a type this board accepts (png, jpeg, pdf, zip)`,
      }
    }

    if (type.handling === 'opaque') {
      const key = storageKey('attachments', input.legacyId, EXTENSIONS[type.contentType] ?? '')
      await this.files.put(key, bytes, { contentType: type.contentType, visibility: 'private' })
      return {
        outcome: 'ready',
        storageKey: key,
        thumbnailKey: null,
        contentType: type.contentType,
        sizeBytes: bytes.byteLength,
        width: null,
        height: null,
      }
    }

    return this.#reencode(input.path, input.legacyId, bytes, type)
  }

  async avatar(input: {
    readonly legacyUserId: number
    readonly path: string
  }): Promise<CopiedAvatar> {
    const bytes = await this.#read(input.path)
    if (bytes === null) {
      return { outcome: 'missing', reason: `avatar ${input.path} missing from uploads directory` }
    }

    const type = sniff(bytes)
    if (type === undefined || type.codec === null) {
      return { outcome: 'failed', reason: `avatar ${input.path} is not a png or jpeg` }
    }

    let processed: Awaited<ReturnType<ImageProcessor['process']>>
    try {
      processed = await this.images.process({
        bytes,
        codec: type.codec,
        fit: AVATAR_BOX,
        thumbnail: false,
      })
    } catch {
      return { outcome: 'failed', reason: `avatar ${input.path} could not be decoded` }
    }

    const key = storageKey('avatars', input.legacyUserId, EXTENSIONS[processed.contentType] ?? '')
    await this.files.put(key, processed.bytes, {
      contentType: processed.contentType,
      visibility: 'public',
    })
    return { outcome: 'ready', key, width: processed.width, height: processed.height }
  }

  async #reencode(
    path: string,
    legacyId: number,
    bytes: Uint8Array,
    type: AttachmentType,
  ): Promise<CopiedAttachment> {
    if (type.codec === null) {
      return { outcome: 'failed', reason: `file ${path} could not be decoded` }
    }

    let processed: Awaited<ReturnType<ImageProcessor['process']>>
    try {
      processed = await this.images.process({ bytes, codec: type.codec })
    } catch {
      return { outcome: 'failed', reason: `file ${path} could not be decoded` }
    }

    const key = storageKey('attachments', legacyId, EXTENSIONS[processed.contentType] ?? '')
    await this.files.put(key, processed.bytes, {
      contentType: processed.contentType,
      visibility: 'private',
    })

    let thumbnailKey: string | null = null
    if (processed.thumbnail !== undefined) {
      thumbnailKey = storageKey('attachments', legacyId, '.thumb.jpg')
      await this.files.put(thumbnailKey, processed.thumbnail.bytes, {
        contentType: processed.thumbnail.contentType,
        visibility: 'private',
      })
    }

    return {
      outcome: 'ready',
      storageKey: key,
      thumbnailKey,
      contentType: processed.contentType,
      sizeBytes: processed.bytes.byteLength,
      width: processed.width,
      height: processed.height,
    }
  }

  async #read(relative: string): Promise<Uint8Array | null> {
    const target = this.#within(relative)
    if (target === null) return null

    if (basename(target).includes('*')) return this.#readGlob(target)

    try {
      return await readFile(target)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
  }

  async #readGlob(target: string): Promise<Uint8Array | null> {
    const dir = dirname(target)
    const pattern = basename(target)
    const star = pattern.indexOf('*')
    const prefix = pattern.slice(0, star)
    const suffix = pattern.slice(star + 1)

    let entries: readonly string[]
    try {
      entries = await readdir(dir)
    } catch {
      return null
    }

    const match = entries.find(
      (entry) =>
        entry.startsWith(prefix) && entry.endsWith(suffix) && entry.length >= pattern.length - 1,
    )
    if (match === undefined) return null

    try {
      return await readFile(join(dir, match))
    } catch {
      return null
    }
  }

  #within(relative: string): string | null {
    if (relative.includes('\0') || relative.trim() === '') return null
    const target = resolve(this.root, normalize(relative))
    if (target !== this.root && !target.startsWith(this.root + sep)) return null
    return target
  }
}

function storageKey(kind: string, legacyId: number, extension: string): string {
  return `import/${kind}/${legacyId}${extension}`
}
