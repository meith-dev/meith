import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  BackupStore,
  backupDestinationFromEnv,
  isBundleName,
  pruneCandidates,
  resolveKeep,
  type S3Like,
} from './backup-store'

const CONFIG = {
  bucket: 'board-backups',
  region: 'auto',
  accessKeyId: 'key',
  secretAccessKey: 'secret',
}

const BUNDLES = [
  'meith-backup-2026-08-30T02-00-00Z.tar.gz',
  'meith-backup-2026-08-31T02-00-00Z.tar.gz',
  'meith-backup-2026-09-01T02-00-00Z.tar.gz',
] as const

describe('isBundleName', () => {
  it('accepts what bundleName writes and nothing looser', () => {
    expect(isBundleName('meith-backup-2026-09-01T02-00-00Z.tar.gz')).toBe(true)
    expect(isBundleName('meith-backup-2026-09-01T02-00-00Z.tar.gz.part')).toBe(false)
    expect(isBundleName('board.tar.gz')).toBe(false)
    expect(isBundleName('meith-backup-latest.tar.gz')).toBe(false)
    expect(isBundleName('')).toBe(false)
  })
})

describe('pruneCandidates', () => {
  it('keeps the newest bundles and names the rest, oldest included', () => {
    expect(pruneCandidates(BUNDLES, 2)).toEqual(['meith-backup-2026-08-30T02-00-00Z.tar.gz'])
    expect(pruneCandidates(BUNDLES, 3)).toEqual([])
    expect(pruneCandidates(BUNDLES, 1)).toEqual([
      'meith-backup-2026-08-31T02-00-00Z.tar.gz',
      'meith-backup-2026-08-30T02-00-00Z.tar.gz',
    ])
  })

  it('never selects a file that is not a bundle', () => {
    const names = [...BUNDLES, 'notes.txt', 'board.tar.gz']
    expect(pruneCandidates(names, 1)).not.toContain('notes.txt')
    expect(pruneCandidates(names, 1)).not.toContain('board.tar.gz')
  })
})

describe('resolveKeep', () => {
  it('defaults to seven and accepts an explicit count', () => {
    expect(resolveKeep(undefined)).toBe(7)
    expect(resolveKeep('14')).toBe(14)
    expect(resolveKeep('1')).toBe(1)
  })

  it('rejects zero, negatives and non-numbers, naming the flag', () => {
    for (const value of ['0', '-1', 'weekly', '1.5']) {
      expect(() => resolveKeep(value)).toThrow('--keep')
    }
  })
})

describe('backupDestinationFromEnv', () => {
  const complete = {
    BACKUP_S3_BUCKET: 'board-backups',
    BACKUP_S3_REGION: 'auto',
    BACKUP_S3_ACCESS_KEY_ID: 'key',
    BACKUP_S3_SECRET_ACCESS_KEY: 'secret',
  }

  it('is off when nothing is set', () => {
    expect(backupDestinationFromEnv({})).toBeUndefined()
  })

  it('reads a complete destination, endpoint and prefix optional', () => {
    expect(backupDestinationFromEnv({ ...complete })).toMatchObject({
      bucket: 'board-backups',
      region: 'auto',
    })
    expect(
      backupDestinationFromEnv({
        ...complete,
        BACKUP_S3_ENDPOINT: 'https://minio.example',
        BACKUP_S3_PREFIX: '/boards/mine/',
      }),
    ).toMatchObject({ endpoint: 'https://minio.example', prefix: 'boards/mine' })
  })

  it('refuses a half-configured destination, naming what is missing', () => {
    expect(() => backupDestinationFromEnv({ BACKUP_S3_BUCKET: 'board-backups' })).toThrow(
      'BACKUP_S3_REGION',
    )
  })

  it('refuses a prefix with empty or relative segments', () => {
    for (const prefix of ['a//b', '..', 'a/../b']) {
      expect(() => backupDestinationFromEnv({ ...complete, BACKUP_S3_PREFIX: prefix })).toThrow(
        'BACKUP_S3_PREFIX',
      )
    }
  })
})

interface FakeObject {
  body: Uint8Array
  size: number
}

function memorySender(objects: Map<string, FakeObject>): S3Like & { deleted: string[] } {
  const sender = {
    deleted: [] as string[],
    async send(command: unknown): Promise<unknown> {
      const name = (command as { constructor: { name: string } }).constructor.name
      const input = (command as { input: Record<string, unknown> }).input

      if (name === 'PutObjectCommand') {
        const chunks: Buffer[] = []
        for await (const chunk of input.Body as AsyncIterable<Buffer>) chunks.push(chunk)
        const body = new Uint8Array(Buffer.concat(chunks))
        objects.set(input.Key as string, { body, size: body.byteLength })
        return {}
      }
      if (name === 'ListObjectsV2Command') {
        const prefix = (input.Prefix as string | undefined) ?? ''
        return {
          Contents: [...objects.entries()]
            .filter(([key]) => key.startsWith(prefix))
            .map(([key, object]) => ({ Key: key, Size: object.size })),
        }
      }
      if (name === 'GetObjectCommand') {
        const object = objects.get(input.Key as string)
        if (object === undefined) {
          throw Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' })
        }
        return { Body: Readable.from(Buffer.from(object.body)) }
      }
      if (name === 'DeleteObjectCommand') {
        objects.delete(input.Key as string)
        sender.deleted.push(input.Key as string)
        return {}
      }
      throw new Error(`unexpected command ${name}`)
    },
  }
  return sender
}

describe('BackupStore', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'meith-backup-store-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('ships a bundle under the prefix and pulls it back byte for byte', async () => {
    const objects = new Map<string, FakeObject>()
    const store = new BackupStore({ ...CONFIG, prefix: 'boards/mine' }, memorySender(objects))

    const source = path.join(dir, BUNDLES[2])
    await writeFile(source, 'bundle-bytes')
    await store.putFile(BUNDLES[2], source, (await stat(source)).size)

    expect([...objects.keys()]).toEqual([`boards/mine/${BUNDLES[2]}`])

    const fetched = path.join(dir, 'fetched.tar.gz')
    await store.getToFile(BUNDLES[2], fetched)
    expect(await readFile(fetched, 'utf8')).toBe('bundle-bytes')
  })

  it('lists only bundles, sorted oldest first', async () => {
    const objects = new Map<string, FakeObject>(
      [...BUNDLES].reverse().map((name) => [name, { body: new Uint8Array(3), size: 3 }]),
    )
    objects.set('notes.txt', { body: new Uint8Array(1), size: 1 })
    const store = new BackupStore(CONFIG, memorySender(objects))

    expect((await store.list()).map((bundle) => bundle.name)).toEqual([...BUNDLES])
  })

  it('leaves another prefix of the bucket alone when listing', async () => {
    const objects = new Map<string, FakeObject>([
      [`mine/${BUNDLES[0]}`, { body: new Uint8Array(1), size: 1 }],
      [`theirs/${BUNDLES[1]}`, { body: new Uint8Array(1), size: 1 }],
    ])
    const store = new BackupStore({ ...CONFIG, prefix: 'mine' }, memorySender(objects))

    expect((await store.list()).map((bundle) => bundle.name)).toEqual([BUNDLES[0]])
  })

  it('prunes the oldest bundles beyond the keep count and reports them', async () => {
    const objects = new Map<string, FakeObject>(
      BUNDLES.map((name) => [name, { body: new Uint8Array(3), size: 3 }]),
    )
    const sender = memorySender(objects)
    const store = new BackupStore(CONFIG, sender)

    const pruned = await store.prune(2)

    expect(pruned).toEqual([BUNDLES[0]])
    expect(sender.deleted).toEqual([BUNDLES[0]])
    expect((await store.list()).map((bundle) => bundle.name)).toEqual([BUNDLES[1], BUNDLES[2]])
  })

  it('answers a missing bundle with the remedy, not an SDK error', async () => {
    const store = new BackupStore(CONFIG, memorySender(new Map()))

    await expect(store.getToFile(BUNDLES[0], path.join(dir, 'missing.tar.gz'))).rejects.toThrow(
      'backup:list',
    )
  })

  it('refuses to address anything that is not a bundle name', async () => {
    const store = new BackupStore(CONFIG, memorySender(new Map()))

    await expect(store.putFile('../escape.tar.gz', path.join(dir, 'x'), 1)).rejects.toThrow(
      'Not a backup bundle name',
    )
    await expect(store.delete('board.tar.gz')).rejects.toThrow('Not a backup bundle name')
  })
})
