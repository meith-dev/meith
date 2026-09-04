import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  backupDestinationFromEnv,
  backupDestinationFromSettings,
  resolveBackupDestination,
  S3BackupDestination,
  type S3Like,
} from './destination'

const CONFIG = {
  kind: 's3' as const,
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

describe('backupDestinationFromEnv', () => {
  const complete = {
    BACKUP_S3_BUCKET: 'board-backups',
    BACKUP_S3_REGION: 'auto',
    BACKUP_S3_ACCESS_KEY_ID: 'key',
    BACKUP_S3_SECRET_ACCESS_KEY: 'secret',
  }

  it('is off when nothing is set', () => {
    expect(backupDestinationFromEnv({})).toBeUndefined()
    expect(backupDestinationFromEnv({ BACKUP_S3_BUCKET: '' })).toBeUndefined()
  })

  it('reads a complete destination, endpoint and prefix optional', () => {
    expect(backupDestinationFromEnv(complete)).toEqual({
      ...CONFIG,
      endpoint: undefined,
      prefix: undefined,
    })
    expect(
      backupDestinationFromEnv({
        ...complete,
        BACKUP_S3_ENDPOINT: 'https://r2.example',
        BACKUP_S3_PREFIX: '/boards/mine/',
      }),
    ).toMatchObject({ endpoint: 'https://r2.example', prefix: 'boards/mine' })
  })

  it('refuses a half-configured destination, naming what is missing', () => {
    expect(() => backupDestinationFromEnv({ BACKUP_S3_BUCKET: 'b' })).toThrow(
      /BACKUP_S3_REGION, BACKUP_S3_ACCESS_KEY_ID and BACKUP_S3_SECRET_ACCESS_KEY|BACKUP_S3_REGION/,
    )
  })

  it('refuses a prefix with empty or relative segments', () => {
    for (const prefix of ['a//b', '..', 'a/../b']) {
      expect(() => backupDestinationFromEnv({ ...complete, BACKUP_S3_PREFIX: prefix })).toThrow(
        'prefix',
      )
    }
  })
})

describe('resolveBackupDestination', () => {
  const settings = {
    kind: 's3' as const,
    bucket: 'panel-backups',
    region: 'eu-central-1',
    accessKeyId: 'panel-key',
    secretAccessKey: 'panel-secret',
    endpoint: '',
    prefix: '',
    webdavUrl: '',
    webdavUsername: '',
    webdavPassword: '',
  }

  it('lets the environment win over the board settings', () => {
    const resolved = resolveBackupDestination({
      environment: {
        BACKUP_S3_BUCKET: 'env-backups',
        BACKUP_S3_REGION: 'auto',
        BACKUP_S3_ACCESS_KEY_ID: 'k',
        BACKUP_S3_SECRET_ACCESS_KEY: 's',
      },
      settings,
    })
    expect(resolved.source).toBe('environment')
    expect(resolved.config).toMatchObject({ kind: 's3', bucket: 'env-backups' })
  })

  it('reads the board settings when the environment says nothing', () => {
    const resolved = resolveBackupDestination({ environment: {}, settings })
    expect(resolved.source).toBe('board')
    expect(resolved.config).toMatchObject({ bucket: 'panel-backups', region: 'eu-central-1' })
  })

  it('reports a half-filled panel destination instead of throwing', () => {
    expect(backupDestinationFromSettings({ ...settings, secretAccessKey: '' })).toMatchObject({
      source: 'board',
      config: null,
      problem: expect.stringContaining('secret access key'),
    })
    expect(backupDestinationFromSettings({ ...settings, kind: 'none' })).toEqual({
      source: 'none',
      config: null,
      problem: null,
    })
  })

  it('reports a half-filled environment destination as a problem, not a crash', () => {
    const resolved = resolveBackupDestination({
      environment: { BACKUP_S3_BUCKET: 'env-backups' },
      settings,
    })
    expect(resolved.source).toBe('environment')
    expect(resolved.config).toBeNull()
    expect(resolved.problem).toContain('partly configured')
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

describe('S3BackupDestination', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'meith-backup-destination-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('ships a bundle under the prefix and pulls it back byte for byte', async () => {
    const objects = new Map<string, FakeObject>()
    const store = new S3BackupDestination(
      { ...CONFIG, prefix: 'boards/mine' },
      memorySender(objects),
    )
    const source = path.join(dir, BUNDLES[0])
    await writeFile(source, 'bundle bytes')

    await store.putFile(BUNDLES[0], source, 12)
    expect([...objects.keys()]).toEqual([`boards/mine/${BUNDLES[0]}`])

    const out = path.join(dir, 'fetched.tar.gz')
    await store.getToFile(BUNDLES[0], out)
    expect(await readFile(out, 'utf8')).toBe('bundle bytes')
    expect((await stat(out)).mode & 0o777).toBe(0o600)
  })

  it('lists only bundles, sorted oldest first, and prunes by policy', async () => {
    const objects = new Map<string, FakeObject>()
    for (const name of [BUNDLES[2], BUNDLES[0], BUNDLES[1], 'notes.txt']) {
      objects.set(name, { body: new Uint8Array(), size: 1 })
    }
    const sender = memorySender(objects)
    const store = new S3BackupDestination(CONFIG, sender)

    expect((await store.list()).map((bundle) => bundle.name)).toEqual([...BUNDLES])
    expect(await store.prune({ keep: 1 }, new Date('2026-09-01T12:00:00Z'))).toEqual([
      BUNDLES[1],
      BUNDLES[0],
    ])
    expect(sender.deleted).toEqual([BUNDLES[1], BUNDLES[0]])
    expect(objects.has('notes.txt')).toBe(true)
  })

  it('answers a missing bundle with the remedy and refuses a non-bundle name', async () => {
    const store = new S3BackupDestination(CONFIG, memorySender(new Map()))
    await expect(store.getToFile(BUNDLES[0], path.join(dir, 'x'))).rejects.toThrow('backup:list')
    await expect(store.delete('../etc/passwd')).rejects.toThrow('Not a backup bundle name')
  })

  it('signs a download link that names the bundle', async () => {
    const store = new S3BackupDestination(
      { ...CONFIG, endpoint: 'https://s3.example' },
      memorySender(new Map()),
    )
    const url = await store.downloadUrl(BUNDLES[0], 300)
    expect(url).toContain(`/board-backups/${BUNDLES[0]}`)
    expect(url).toContain('X-Amz-Expires=300')
  })
})
