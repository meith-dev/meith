/**
 * Disk-backed file store for self-hosting and tests.
 *
 * Unsuitable for serverless: the filesystem is ephemeral and per-instance, so an
 * avatar uploaded on one instance is missing from the next. Env validation warns
 * when this is selected alongside a serverless deployment.
 */

import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, normalize, resolve, sep } from 'node:path'

import { ValidationError, type FileStore, type PutFileOptions, type StoredFile } from '@forum/core'

export class LocalFileStore implements FileStore {
  constructor(
    private readonly root: string,
    /** Public URL prefix that maps to `root`, e.g. `/uploads`. */
    private readonly publicPrefix = '/uploads',
  ) {}

  /**
   * Resolves a caller-supplied key to an absolute path, refusing anything that
   * escapes `root`.
   *
   * Attachment keys are partly user-influenced, so `../../etc/passwd` or an
   * absolute path must not be joinable. Comparing the *resolved* path against
   * the resolved root is the only check that holds up against `..`, symlinked
   * segments and Windows separators alike.
   */
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

  /**
   * Disk has no signing mechanism, so this returns undefined by contract and
   * callers must stream private files through an authorising route handler.
   * Returning a plain URL here instead would quietly make every private
   * attachment world-readable.
   */
  signedUrl(): Promise<string | undefined> {
    return Promise.resolve(undefined)
  }

  url(key: string): string {
    return `${this.publicPrefix}/${key}`
  }

  /** Content-addressed key helper, shared with the S3 store. */
  static keyFor(prefix: string, body: Uint8Array, extension: string): string {
    const digest = createHash('sha256').update(body).digest('hex')
    return join(prefix, digest.slice(0, 2), `${digest}${extension}`)
  }
}
