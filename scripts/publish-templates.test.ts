import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { mirror, worktreeFiles } from './publish-templates.mts'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'meith-mirror-test-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('mirror', () => {
  it('makes the destination an exact copy of the source tree', async () => {
    await writeFile(join(dir, 'keep.txt'), 'old')
    await writeFile(join(dir, 'stale.txt'), 'delete me')
    await mkdir(join(dir, 'nested'), { recursive: true })
    await writeFile(join(dir, 'nested', 'gone.txt'), 'delete me too')

    const source = new Map([
      ['keep.txt', 'new'],
      ['added.txt', 'fresh'],
    ])

    const changed = await mirror(source, dir)

    expect(await worktreeFiles(dir)).toEqual(source)
    expect(changed).toEqual(['added.txt', 'keep.txt', 'nested/gone.txt', 'stale.txt'])
  })

  it('leaves the .git directory untouched and reports no change when already in sync', async () => {
    await mkdir(join(dir, '.git'), { recursive: true })
    await writeFile(join(dir, '.git', 'HEAD'), 'ref: refs/heads/main')
    await writeFile(join(dir, 'README.md'), 'hello')

    const source = new Map([['README.md', 'hello']])
    const changed = await mirror(source, dir)

    expect(changed).toEqual([])
    expect(await readFile(join(dir, '.git', 'HEAD'), 'utf8')).toBe('ref: refs/heads/main')
    expect(await worktreeFiles(dir)).toEqual(source)
  })
})
