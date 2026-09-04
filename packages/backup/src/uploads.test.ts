import { mkdir, mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { drainStoreToDirectory, type ListableStore, uploadDirectoryToStore } from './uploads'

function memoryStore(seed: ReadonlyMap<string, string>): ListableStore & {
  objects: Map<string, Uint8Array>
} {
  const objects = new Map<string, Uint8Array>()
  for (const [key, body] of seed) objects.set(key, new TextEncoder().encode(body))
  return {
    objects,
    async *listKeys() {
      for (const key of [...objects.keys()].sort()) yield key
    },
    get(key) {
      return Promise.resolve(objects.get(key))
    },
  }
}

const CONTENT = new Map([
  ['attachments/a1/source', 'the first attachment'],
  ['attachments/a2/source', 'the second attachment'],
  ['attachments/a2/thumb', 'a thumbnail'],
  ['avatars/ab/deadbeef.png', 'avatar bytes'],
  ['logos/board.svg', '<svg/>'],
])

describe('carrying an object store out and putting it back', () => {
  let scratch: string

  beforeEach(async () => {
    scratch = await mkdtemp(path.join(tmpdir(), 'meith-store-roundtrip-'))
  })

  afterEach(async () => {
    await rm(scratch, { recursive: true, force: true })
  })

  it('pulls every object out and pushes the tree back with the keys unchanged', async () => {
    const dir = path.join(scratch, 'uploads')
    await mkdir(dir, { recursive: true })

    const { pulled, skipped } = await drainStoreToDirectory(memoryStore(CONTENT), dir)
    expect(pulled).toBe(CONTENT.size)
    expect(skipped).toEqual([])
    expect(await readFile(path.join(dir, 'attachments/a2/thumb'), 'utf8')).toBe('a thumbnail')

    const bucket = new Map<string, { body: Uint8Array; contentType: string }>()
    const pushed = await uploadDirectoryToStore(
      {
        put(key, body, options) {
          bucket.set(key, { body, contentType: options.contentType })
          return Promise.resolve({ key, size: body.byteLength, contentType: options.contentType })
        },
      },
      dir,
    )
    expect(pushed).toBe(CONTENT.size)
    expect([...bucket.keys()].sort()).toEqual([...CONTENT.keys()].sort())
    expect(bucket.get('avatars/ab/deadbeef.png')?.contentType).toBe('image/png')
  })

  it('refuses to write an object whose key escapes the staging directory', async () => {
    const store = memoryStore(new Map([['safe.txt', 'kept']]))
    store.objects.set('../escaped.txt', new TextEncoder().encode('should not land'))
    const dir = path.join(scratch, 'uploads')
    await mkdir(dir, { recursive: true })
    const warnings: string[] = []

    const { pulled, skipped } = await drainStoreToDirectory(store, dir, (line) =>
      warnings.push(line),
    )

    expect(pulled).toBe(1)
    expect(skipped).toEqual(['../escaped.txt'])
    expect(warnings[0]).toContain('../escaped.txt')
    expect(await readdir(dir)).toEqual(['safe.txt'])
    await expect(stat(path.join(scratch, 'escaped.txt'))).rejects.toThrow()
  })

  it('skips unusable keys, reports every one, and finishes', async () => {
    const store = memoryStore(CONTENT)
    store.objects.set('attachments/./one.txt', new TextEncoder().encode('one'))
    store.objects.set('attachments/two\u0007.txt', new TextEncoder().encode('two'))
    store.objects.set('  spaced.txt  ', new TextEncoder().encode('three'))
    const dir = path.join(scratch, 'uploads')
    await mkdir(dir, { recursive: true })

    const { pulled, skipped } = await drainStoreToDirectory(store, dir)

    expect(pulled).toBe(CONTENT.size)
    expect([...skipped].sort()).toEqual(
      ['  spaced.txt  ', 'attachments/./one.txt', 'attachments/two\u0007.txt'].sort(),
    )
  })

  it('lets a failure that is not the key abort the backup', async () => {
    const store = memoryStore(CONTENT)
    store.get = () => Promise.reject(new Error('the store is unreachable'))
    const dir = path.join(scratch, 'uploads')
    await mkdir(dir, { recursive: true })

    await expect(drainStoreToDirectory(store, dir)).rejects.toThrow(/unreachable/)
  })
})
