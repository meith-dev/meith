import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { backupDestinationFromEnv, backupDestinationFromSettings } from './destination'
import { parsePropfind, WebDavBackupDestination } from './webdav'

const BUNDLES = [
  'meith-backup-2026-08-30T02-00-00Z.tar.gz',
  'meith-backup-2026-08-31T02-00-00Z.tar.gz',
  'meith-backup-2026-09-01T02-00-00Z.tar.gz',
] as const

interface FakeServer {
  readonly url: string
  readonly objects: Map<string, Buffer>
  readonly requests: string[]
  close(): Promise<void>
}

function fakeWebDav(): Promise<FakeServer> {
  const objects = new Map<string, Buffer>()
  const requests: string[] = []
  const folder = '/dav/board-backups/'

  const server = http.createServer((request, response) => {
    requests.push(`${request.method} ${request.url}`)
    if (request.headers.authorization !== `Basic ${Buffer.from('nc:pass').toString('base64')}`) {
      response.writeHead(401).end()
      request.resume()
      return
    }
    const url = new URL(request.url ?? '/', 'http://fake')
    const name = decodeURIComponent(url.pathname.slice(folder.length))

    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => {
      const body = Buffer.concat(chunks)
      switch (request.method) {
        case 'PROPFIND': {
          const entries = [
            `<d:response><d:href>${folder}</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response>`,
            ...[...objects].map(
              ([key, value]) =>
                `<d:response><d:href>${folder}${encodeURIComponent(key)}</d:href><d:propstat><d:prop><d:getcontentlength>${value.byteLength}</d:getcontentlength></d:prop></d:propstat></d:response>`,
            ),
          ]
          response.writeHead(207, { 'Content-Type': 'application/xml' })
          response.end(
            `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">${entries.join('')}</d:multistatus>`,
          )
          return
        }
        case 'PUT':
          if (request.headers['content-length'] !== String(body.byteLength)) {
            response.writeHead(411).end()
            return
          }
          objects.set(name, body)
          response.writeHead(201).end()
          return
        case 'GET': {
          const found = objects.get(name)
          if (found === undefined) {
            response.writeHead(404).end()
            return
          }
          response.writeHead(200, { 'Content-Length': String(found.byteLength) })
          response.end(found)
          return
        }
        case 'DELETE':
          response.writeHead(objects.delete(name) ? 204 : 404).end()
          return
        default:
          response.writeHead(405).end()
      }
    })
  })

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      resolve({
        url: `http://127.0.0.1:${port}${folder}`,
        objects,
        requests,
        close: () =>
          new Promise((done) => {
            server.close(() => done())
          }),
      })
    })
  })
}

describe('parsePropfind', () => {
  it('reads hrefs and sizes whatever prefix the server used', () => {
    const xml =
      '<D:multistatus xmlns:D="DAV:"><D:response><D:href>/a/</D:href></D:response>' +
      '<D:response><D:href>/a/x%20y.tar.gz</D:href><D:propstat><D:prop>' +
      '<D:getcontentlength>12</D:getcontentlength></D:prop></D:propstat></D:response>' +
      '<response xmlns="DAV:"><href>/a/b&amp;c</href><propstat><prop>' +
      '<getcontentlength>3</getcontentlength></prop></propstat></response></D:multistatus>'
    expect(parsePropfind(xml)).toEqual([
      { href: '/a/', size: null },
      { href: '/a/x%20y.tar.gz', size: 12 },
      { href: '/a/b&c', size: 3 },
    ])
  })
})

describe('WebDavBackupDestination', () => {
  let server: FakeServer
  let dir: string

  beforeAll(async () => {
    server = await fakeWebDav()
  })

  afterAll(async () => {
    await server.close()
  })

  beforeEach(async () => {
    server.objects.clear()
    server.requests.length = 0
    dir = await mkdtemp(path.join(tmpdir(), 'meith-webdav-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  function destination(password = 'pass'): WebDavBackupDestination {
    return new WebDavBackupDestination({
      kind: 'webdav',
      url: server.url,
      username: 'nc',
      password,
    })
  }

  it('uploads a bundle with its length, lists it, streams it back, and deletes it', async () => {
    const source = path.join(dir, BUNDLES[0])
    await writeFile(source, 'bundle bytes')
    const store = destination()

    await store.putFile(BUNDLES[0], source, 12)
    expect(server.objects.get(BUNDLES[0])?.toString()).toBe('bundle bytes')

    expect(await store.list()).toEqual([{ name: BUNDLES[0], size: 12 }])

    const opened = await store.open(BUNDLES[0])
    expect(opened?.size).toBe(12)
    const out = path.join(dir, 'fetched.tar.gz')
    await store.getToFile(BUNDLES[0], out)
    expect(await readFile(out, 'utf8')).toBe('bundle bytes')
    expect((await stat(out)).mode & 0o777).toBe(0o600)

    await store.delete(BUNDLES[0])
    expect(server.objects.size).toBe(0)
    expect(await store.open(BUNDLES[0])).toBeNull()
  })

  it('lists only bundles, sorted oldest first, and prunes by policy', async () => {
    for (const name of [BUNDLES[2], BUNDLES[0], BUNDLES[1], 'notes.txt']) {
      server.objects.set(name, Buffer.from('x'))
    }
    const store = destination()

    expect((await store.list()).map((bundle) => bundle.name)).toEqual([...BUNDLES])
    expect(await store.prune({ keep: 1 }, new Date('2026-09-01T12:00:00Z'))).toEqual([
      BUNDLES[1],
      BUNDLES[0],
    ])
    expect([...server.objects.keys()].sort()).toEqual([BUNDLES[2], 'notes.txt'])
  })

  it('names the credential when the server refuses, and the bundle when it is missing', async () => {
    await expect(destination('wrong').list()).rejects.toThrow(/401.*username and password/)
    await expect(destination().getToFile(BUNDLES[0], path.join(dir, 'x'))).rejects.toThrow(
      'backup:list',
    )
    await expect(destination().delete('../etc/passwd')).rejects.toThrow('Not a backup bundle name')
  })

  it('describes itself without the credential', () => {
    expect(destination().description).toContain('/dav/board-backups/')
    expect(destination().description).not.toContain('pass')
  })
})

describe('resolving a WebDAV destination', () => {
  it('reads one from the environment, folder slash added, and refuses half a credential', () => {
    expect(
      backupDestinationFromEnv({
        BACKUP_WEBDAV_URL: 'https://cloud.example/remote.php/dav/files/nc/backups',
        BACKUP_WEBDAV_USERNAME: 'nc',
        BACKUP_WEBDAV_PASSWORD: 'pass',
      }),
    ).toEqual({
      kind: 'webdav',
      url: 'https://cloud.example/remote.php/dav/files/nc/backups/',
      username: 'nc',
      password: 'pass',
    })
    expect(() =>
      backupDestinationFromEnv({
        BACKUP_WEBDAV_URL: 'https://x.example/',
        BACKUP_WEBDAV_USERNAME: 'nc',
      }),
    ).toThrow('together')
    expect(() => backupDestinationFromEnv({ BACKUP_WEBDAV_PASSWORD: 'pass' })).toThrow(
      'without BACKUP_WEBDAV_URL',
    )
    expect(() => backupDestinationFromEnv({ BACKUP_WEBDAV_URL: 'ftp://x.example/' })).toThrow(
      'http://',
    )
  })

  it('refuses two destinations in the environment at once', () => {
    expect(() =>
      backupDestinationFromEnv({
        BACKUP_S3_BUCKET: 'b',
        BACKUP_S3_REGION: 'auto',
        BACKUP_S3_ACCESS_KEY_ID: 'k',
        BACKUP_S3_SECRET_ACCESS_KEY: 's',
        BACKUP_WEBDAV_URL: 'https://x.example/',
      }),
    ).toThrow('one destination')
  })

  it('reads one from the board settings, and reports what is missing', () => {
    const settings = {
      kind: 'webdav' as const,
      bucket: '',
      region: '',
      accessKeyId: '',
      secretAccessKey: '',
      endpoint: '',
      prefix: '',
      webdavUrl: 'https://cloud.example/dav/backups',
      webdavUsername: 'nc',
      webdavPassword: 'pass',
    }
    expect(backupDestinationFromSettings(settings).config).toEqual({
      kind: 'webdav',
      url: 'https://cloud.example/dav/backups/',
      username: 'nc',
      password: 'pass',
    })
    expect(backupDestinationFromSettings({ ...settings, webdavPassword: '' }).problem).toContain(
      'both, or neither',
    )
    expect(backupDestinationFromSettings({ ...settings, webdavUrl: '' }).problem).toContain(
      'no address',
    )
    expect(backupDestinationFromSettings({ ...settings, kind: 's3' }).problem).toContain(
      'no bucket',
    )
  })
})
