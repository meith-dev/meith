import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ConfigurationError } from '@meith/core'

import { LocalFileStore } from './local-file-store'

let root: string
let store: LocalFileStore
const bytes = new TextEncoder().encode('saved bytes')
const options = { contentType: 'text/plain', visibility: 'public' as const }

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'meith-local-keys-'))
  store = new LocalFileStore(root)
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('local file keys', () => {
  it.each([
    '',
    '.',
    '..',
    '../outside',
    'a/../b',
    '/absolute',
    'a//b',
    ' leading',
    'trailing ',
    'control\u0000',
    'control\n',
  ])('rejects an unusable key %j consistently', async (key) => {
    await expect(store.put(key, bytes, options)).rejects.toBeInstanceOf(ConfigurationError)
    await expect(store.get(key)).rejects.toBeInstanceOf(ConfigurationError)
    await expect(store.delete(key)).rejects.toBeInstanceOf(ConfigurationError)
    await expect(store.signedUrl(key)).rejects.toBeInstanceOf(ConfigurationError)
    expect(() => store.url(key)).toThrow(ConfigurationError)
  })

  it('encodes URL segments without changing the stored key or bytes', async () => {
    const key = 'folder/a space#?%é.txt'
    expect(await store.put(key, bytes, options)).toMatchObject({ key })
    expect(new TextDecoder().decode(await store.get(key))).toBe('saved bytes')
    expect(store.url(key)).toBe('/uploads/folder/a%20space%23%3F%25%C3%A9.txt')
    expect(await store.signedUrl(key)).toBeUndefined()
    await store.delete(key)
    expect(await store.get(key)).toBeUndefined()
  })
})
