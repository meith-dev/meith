import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { type FileStore, unusableKeyReason } from '@meith/core'

import { contentTypeFor } from './bundle'

export interface ListableStore {
  listKeys(): AsyncGenerator<string>
  get(key: string): Promise<Uint8Array | undefined>
}

export interface DrainedStore {
  readonly pulled: number
  readonly skipped: readonly string[]
}

export async function drainStoreToDirectory(
  store: ListableStore,
  dir: string,
  warn: (line: string) => void = () => undefined,
): Promise<DrainedStore> {
  let pulled = 0
  const skipped: string[] = []

  for await (const key of store.listKeys()) {
    const target = path.resolve(dir, key)
    if (target !== dir && !target.startsWith(dir + path.sep)) {
      warn(`Skipping the object at ${JSON.stringify(key)}: its key escapes ${dir}.`)
      skipped.push(key)
      continue
    }
    const unusable = unusableKeyReason(key)
    if (unusable !== undefined) {
      warn(`Skipping the object at ${JSON.stringify(key)}: its key ${unusable}.`)
      skipped.push(key)
      continue
    }
    const body = await store.get(key)
    if (body === undefined) continue
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, body)
    pulled++
  }

  return { pulled, skipped }
}

export async function walk(dir: string): Promise<readonly string[]> {
  const files: string[] = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...(await walk(full)))
    else if (entry.isFile()) files.push(full)
  }
  return files
}

export async function uploadDirectoryToStore(
  store: { put: FileStore['put'] },
  dir: string,
): Promise<number> {
  let pushed = 0

  for (const file of await walk(dir)) {
    const key = path.relative(dir, file).split(path.sep).join('/')
    await store.put(key, await readFile(file), {
      contentType: contentTypeFor(key),
      visibility: 'public',
    })
    pushed++
  }

  return pushed
}
