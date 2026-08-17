import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, normalize, resolve, sep } from 'node:path'

import { type FileStore, type PutFileOptions, type StoredFile, ValidationError } from '@meith/core'

export class LocalFileStore implements FileStore {
  constructor(
    private readonly root: string,
    private readonly publicPrefix = '/uploads',
  ) {}

  private pathFor(key: string): string {
    if (key.includes('\0')) throw new ValidationError('Invalid file key.')

    const base = resolve(this.root)
    const target = resolve(base, normalize(key))

    if (target !== base && !target.startsWith(base + sep)) {
      throw new ValidationError('Invalid file key.')
    }
    return target
  }

  async put(key: string, body: Uint8Array, options: PutFileOptions): Promise<StoredFile> {
    const path = this.pathFor(key)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, body)

    return { key, size: body.byteLength, contentType: options.contentType }
  }

  async get(key: string): Promise<Uint8Array | undefined> {
    try {
      return await readFile(this.pathFor(key))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      throw error
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true })
  }

  signedUrl(): Promise<string | undefined> {
    return Promise.resolve(undefined)
  }

  url(key: string): string {
    return `${this.publicPrefix}/${key}`
  }

  static keyFor(prefix: string, body: Uint8Array, extension: string): string {
    const digest = createHash('sha256').update(body).digest('hex')
    return join(prefix, digest.slice(0, 2), `${digest}${extension}`)
  }
}
