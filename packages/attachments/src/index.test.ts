import { beforeEach, describe, expect, it } from 'vitest'

import { ValidationError } from '@meith/core'

import {
  ATTACHMENT_TYPES,
  type AttachmentRecord,
  type AttachmentRepository,
  AttachmentService,
  acceptFile,
  acceptFiles,
  attachmentType,
  type CreateAttachmentInput,
  declaredDimensions,
  HARD_MAX_BYTES,
  HARD_MAX_PER_POST,
  type ImageProcessor,
  type IncomingFile,
  MAX_MEGAPIXELS,
  maxBytesFor,
  maxPerPostFor,
  ORPHAN_GRACE_MINUTES,
  PROCESSING_GRACE_MINUTES,
  type ReadyInput,
  sanitiseFilename,
  sniff,
  storageKeyFor,
} from './index'

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function png(width = 10, height = 10): Uint8Array {
  const bytes = new Uint8Array(64)
  bytes.set(PNG_SIGNATURE)
  bytes.set([0, 0, 0, 13], 8)
  bytes.set([0x49, 0x48, 0x44, 0x52], 12)
  new DataView(bytes.buffer).setUint32(16, width)
  new DataView(bytes.buffer).setUint32(20, height)
  return bytes
}

function jpeg(width = 10, height = 10, extraSegments = 1): Uint8Array {
  const parts: number[] = [0xff, 0xd8]
  for (let i = 0; i < extraSegments; i += 1) {
    parts.push(0xff, 0xe0, 0x00, 0x08, 1, 2, 3, 4, 5, 6)
  }
  parts.push(0xff, 0xc0, 0x00, 0x11, 0x08)
  parts.push((height >> 8) & 0xff, height & 0xff, (width >> 8) & 0xff, width & 0xff)
  return new Uint8Array(parts)
}

function pdf(): Uint8Array {
  return new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37])
}

function zip(): Uint8Array {
  return new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0])
}

const NO_LIMITS = { maxPerPost: 0, maxSizeKb: 0 }

describe('sniff', () => {
  it('identifies each accepted format from its bytes', () => {
    expect(sniff(png())?.contentType).toBe('image/png')
    expect(sniff(jpeg())?.contentType).toBe('image/jpeg')
    expect(sniff(pdf())?.contentType).toBe('application/pdf')
    expect(sniff(zip())?.contentType).toBe('application/zip')
  })

  it('checks the whole PNG signature, not the first four bytes', () => {
    const mangled = png()
    mangled[6] = 0x00
    expect(sniff(mangled)).toBeUndefined()
  })

  it('does not accept a two-byte JPEG lookalike', () => {
    expect(sniff(new Uint8Array([0xff, 0xd8, 0x00, 0x00]))).toBeUndefined()
  })

  it('returns nothing for anything else, including a script and a GIF', () => {
    expect(sniff(new TextEncoder().encode('<?php echo 1; ?>'))).toBeUndefined()
    expect(sniff(new TextEncoder().encode('GIF89a'))).toBeUndefined()
    expect(sniff(new TextEncoder().encode('plain text'))).toBeUndefined()
  })

  it('refuses bytes shorter than the signature it would match', () => {
    expect(sniff(new Uint8Array([0x89, 0x50]))).toBeUndefined()
    expect(sniff(new Uint8Array())).toBeUndefined()
  })

  it('never claims a type that is not in the registry', () => {
    const registered = new Set(ATTACHMENT_TYPES.map((t) => t.contentType))
    expect(registered).toEqual(
      new Set(['image/png', 'image/jpeg', 'application/pdf', 'application/zip']),
    )
    expect(attachmentType('image/gif')).toBeUndefined()
    expect(attachmentType('text/html')).toBeUndefined()
  })
})

describe('declaredDimensions', () => {
  const pngType = attachmentType('image/png')!
  const jpegType = attachmentType('image/jpeg')!

  it('reads a PNG from its IHDR', () => {
    expect(declaredDimensions(png(1234, 567), pngType)).toEqual({
      width: 1234,
      height: 567,
    })
  })

  it('reads a JPEG past the segments in front of the frame header', () => {
    expect(declaredDimensions(jpeg(800, 600, 3), jpegType)).toEqual({
      width: 800,
      height: 600,
    })
  })

  it('refuses a PNG whose IHDR is not first', () => {
    const odd = png()
    odd.set([0x74, 0x45, 0x58, 0x74], 12)
    expect(declaredDimensions(odd, pngType)).toBeUndefined()
  })

  it('refuses a zero dimension, which no decoder can use', () => {
    expect(declaredDimensions(png(0, 10), pngType)).toBeUndefined()
    expect(declaredDimensions(jpeg(10, 0), jpegType)).toBeUndefined()
  })

  it('terminates on a segment whose length does not move forward', () => {
    const hostile = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00, 0, 0, 0, 0])
    expect(declaredDimensions(hostile, jpegType)).toBeUndefined()
  })

  it('returns nothing for a format that has no dimensions', () => {
    expect(declaredDimensions(pdf(), attachmentType('application/pdf')!)).toBeUndefined()
  })
})

describe('sanitiseFilename', () => {
  const pngType = attachmentType('image/png')!
  const zipType = attachmentType('application/zip')!

  it('keeps an ordinary name', () => {
    expect(sanitiseFilename('holiday photo.png', pngType)).toBe('holiday photo.png')
  })

  it('gives the file the extension its content implies, not the one claimed', () => {
    expect(sanitiseFilename('invoice.pdf.exe', pngType)).toBe('invoice.pdf.png')
    expect(sanitiseFilename('report.png', zipType)).toBe('report.zip')
  })

  it('drops any path the browser sent', () => {
    expect(sanitiseFilename('C:\\Users\\ada\\secret.png', pngType)).toBe('secret.png')
    expect(sanitiseFilename('../../etc/passwd', pngType)).toBe('passwd.png')
  })

  it('removes characters a header or a page would choke on', () => {
    const nasty = sanitiseFilename('a\r\nb<script>"x".png', pngType)
    expect(nasty).not.toMatch(/[\r\n<>"]/)
    expect(nasty.endsWith('.png')).toBe(true)
  })

  it('never returns something that starts with a dot or is only an extension', () => {
    expect(sanitiseFilename('...', pngType)).toBe('file.png')
    expect(sanitiseFilename('.htaccess', pngType)).toBe('file.png')
    expect(sanitiseFilename('', pngType)).toBe('file.png')
  })

  it('bounds the length', () => {
    expect(sanitiseFilename(`${'a'.repeat(400)}.png`, pngType).length).toBeLessThanOrEqual(100)
  })
})

describe('storageKeyFor', () => {
  it('is random and unrelated to the filename', () => {
    let n = 0
    const key = storageKeyFor('source', () => {
      n += 1
      return `r${n}`
    })
    expect(key).toBe('attachments/r1/source')
    expect(storageKeyFor('thumb', () => 'r2')).toBe('attachments/r2/thumb')
  })
})

describe('limits', () => {
  it('treats 0 as unlimited, bounded by the hard ceiling', () => {
    expect(maxBytesFor({ maxPerPost: 0, maxSizeKb: 0 })).toBe(HARD_MAX_BYTES)
    expect(maxPerPostFor({ maxPerPost: 0, maxSizeKb: 0 })).toBe(HARD_MAX_PER_POST)
  })

  it('never lets a configured value exceed the ceiling', () => {
    expect(maxBytesFor({ maxPerPost: 0, maxSizeKb: 10_000_000 })).toBe(HARD_MAX_BYTES)
    expect(maxPerPostFor({ maxPerPost: 500, maxSizeKb: 0 })).toBe(HARD_MAX_PER_POST)
  })

  it('honours a configured value below the ceiling', () => {
    expect(maxBytesFor({ maxPerPost: 0, maxSizeKb: 64 })).toBe(65_536)
    expect(maxPerPostFor({ maxPerPost: 2, maxSizeKb: 0 })).toBe(2)
  })
})

describe('acceptFile', () => {
  it('accepts each format and returns the sniffed type', () => {
    expect(acceptFile({ filename: 'a.png', bytes: png() }, NO_LIMITS).type.contentType).toBe(
      'image/png',
    )
    expect(acceptFile({ filename: 'a.zip', bytes: zip() }, NO_LIMITS).type.contentType).toBe(
      'application/zip',
    )
  })

  it('ignores the extension entirely and trusts only the bytes', () => {
    const accepted = acceptFile({ filename: 'payload.exe', bytes: png() }, NO_LIMITS)
    expect(accepted.type.contentType).toBe('image/png')
    expect(accepted.filename).toBe('payload.png')
  })

  it('refuses a type not on the list', () => {
    expect(() =>
      acceptFile({ filename: 'x.gif', bytes: new TextEncoder().encode('GIF89a...') }, NO_LIMITS),
    ).toThrow(ValidationError)
  })

  it('refuses an empty file', () => {
    expect(() => acceptFile({ filename: 'x.png', bytes: new Uint8Array() }, NO_LIMITS)).toThrow(
      /empty/,
    )
  })

  it('refuses one over the size limit, naming the file', () => {
    const big = new Uint8Array(200 * 1024)
    big.set(png())
    expect(() =>
      acceptFile({ filename: 'big.png', bytes: big }, { maxPerPost: 0, maxSizeKb: 64 }),
    ).toThrow(/“big.png”[\s\S]*limit/)
  })

  it('refuses a decompression bomb, which no size limit catches', () => {
    expect(() =>
      acceptFile({ filename: 'bomb.png', bytes: png(30_000, 30_000) }, NO_LIMITS),
    ).toThrow(/megapixel/)
  })

  it('accepts an image just inside the megapixel limit', () => {
    const side = Math.floor(Math.sqrt(MAX_MEGAPIXELS * 1_000_000)) - 1
    expect(() =>
      acceptFile({ filename: 'ok.png', bytes: png(side, side) }, NO_LIMITS),
    ).not.toThrow()
  })

  it('refuses an image whose header cannot be read', () => {
    const broken = png()
    broken.set([0, 0, 0, 0], 16)
    expect(() => acceptFile({ filename: 'x.png', bytes: broken }, NO_LIMITS)).toThrow(/header/)
  })

  it('does not ask a PDF for its dimensions', () => {
    expect(() => acceptFile({ filename: 'x.pdf', bytes: pdf() }, NO_LIMITS)).not.toThrow()
  })
})

describe('acceptFiles', () => {
  const four: IncomingFile[] = Array.from({ length: 4 }, (_, i) => ({
    filename: `f${i}.png`,
    bytes: png(),
  }))

  it('accepts a submission inside the cap', () => {
    expect(acceptFiles(four, { maxPerPost: 4, maxSizeKb: 0 })).toHaveLength(4)
  })

  it('counts what the post already has', () => {
    expect(() => acceptFiles([four[0]!], { maxPerPost: 4, maxSizeKb: 0 }, 4)).toThrow(/at most 4/)
  })

  it('refuses the whole submission when one file is bad', () => {
    expect(() =>
      acceptFiles(
        [four[0]!, { filename: 'bad.txt', bytes: new TextEncoder().encode('hello') }],
        NO_LIMITS,
      ),
    ).toThrow(ValidationError)
  })
})

class FakeRepo implements AttachmentRepository {
  rows: AttachmentRecord[] = []
  keys = new Map<string, Date>()
  nextId = 1
  now = new Date()

  async create(input: CreateAttachmentInput) {
    const row: AttachmentRecord = {
      id: this.nextId++,
      postId: input.postId,
      forumId: input.forumId,
      uploaderUserId: input.uploaderUserId,
      filename: input.filename,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      storageKey: input.storageKey,
      sourceKey: input.sourceKey,
      thumbnailKey: null,
      width: null,
      height: null,
      status: input.status,
      failureReason: null,
      downloadCount: 0,
      createdAt: this.now,
    }
    this.rows.push(row)
    return row
  }

  async findById(id: number) {
    return this.rows.find((row) => row.id === id) ?? null
  }
  async findForDownload(id: number) {
    const record = await this.findById(id)
    return record === null
      ? null
      : {
          record,
          postVisibility: 'visible',
          threadVisibility: 'visible',
          threadAuthorUserId: null,
        }
  }
  async listForPosts(postIds: readonly number[]) {
    return this.rows.filter((row) => row.postId !== null && postIds.includes(row.postId))
  }
  async countForPost(postId: number) {
    return this.rows.filter((row) => row.postId === postId).length
  }
  async attachTo(id: number, postId: number) {
    const row = this.rows.find((r) => r.id === id)
    if (row === undefined || row.postId !== null) return null
    this.update(id, { postId })
    return (await this.findById(id))!
  }
  async deleteForPost(id: number, postId: number) {
    const row = this.rows.find((r) => r.id === id)
    if (row === undefined || row.postId !== postId) return null
    this.rows = this.rows.filter((r) => r.id !== id)
    return row
  }
  async deleteOrphans(before: Date, limit: number) {
    const stale = this.rows
      .filter((row) => row.postId === null && row.createdAt < before)
      .slice(0, limit)
    const staleIds = new Set(stale.map((row) => row.id))
    this.rows = this.rows.filter((row) => !staleIds.has(row.id))
    return stale
  }
  async markReady(id: number, input: ReadyInput) {
    this.update(id, { ...input, status: 'ready', sourceKey: null })
  }
  async markFailed(id: number, reason: string) {
    this.update(id, { status: 'failed', failureReason: reason })
  }
  async recordDownload(id: number) {
    const row = this.rows.find((r) => r.id === id)
    if (row) this.update(id, { downloadCount: row.downloadCount + 1 })
  }
  async stalled(before: Date, limit: number) {
    return this.rows
      .filter((row) => row.status === 'pending' && row.createdAt < before)
      .slice(0, limit)
  }
  async rememberKey(key: string) {
    this.keys.set(key, this.now)
  }
  async forgetKeys(keys: readonly string[]) {
    for (const key of keys) this.keys.delete(key)
  }
  async staleKeys(before: Date, limit: number) {
    return [...this.keys.entries()]
      .filter(([, at]) => at < before)
      .slice(0, limit)
      .map(([key]) => key)
  }

  private update(id: number, patch: Partial<AttachmentRecord>) {
    this.rows = this.rows.map((row) => (row.id === id ? { ...row, ...patch } : row))
  }
}

class FakeFiles {
  objects = new Map<string, { bytes: Uint8Array; contentType: string; visibility: string }>()

  async put(key: string, body: Uint8Array, options: { contentType: string; visibility: string }) {
    this.objects.set(key, { bytes: body, ...options })
    return { key, size: body.length, contentType: options.contentType }
  }
  async get(key: string) {
    return this.objects.get(key)?.bytes
  }
  async delete(key: string) {
    this.objects.delete(key)
  }
  async signedUrl() {
    return undefined
  }
  url(key: string) {
    return `/files/${key}`
  }
}

class FakeImages implements ImageProcessor {
  fail = false
  calls = 0
  withThumbnail = true

  async process(input: { bytes: Uint8Array; codec: 'png' | 'jpeg' }) {
    this.calls += 1
    if (this.fail) throw new Error('nope')
    return {
      bytes: new TextEncoder().encode(`reencoded:${input.codec}`),
      contentType: input.codec === 'png' ? 'image/png' : 'image/jpeg',
      width: 800,
      height: 600,
      ...(this.withThumbnail
        ? { thumbnail: { bytes: new TextEncoder().encode('thumb'), contentType: 'image/jpeg' } }
        : {}),
    }
  }
}

let repo: FakeRepo
let files: FakeFiles
let images: FakeImages
let service: AttachmentService
let counter: number
const NOW = new Date('2026-08-02T12:00:00Z')

beforeEach(() => {
  repo = new FakeRepo()
  repo.now = NOW
  files = new FakeFiles()
  images = new FakeImages()
  counter = 0
  service = new AttachmentService({
    attachments: repo,
    files: files as never,
    images,
    random: () => {
      counter += 1
      return `k${counter}`
    },
    now: () => NOW,
  })
})

const POST = { postId: 7, forumId: 3, userId: 11 }

describe('staging', () => {
  it('remembers the key before the object exists', async () => {
    const order: string[] = []
    const watched = new AttachmentService({
      attachments: {
        ...repo,
        rememberKey: async (key: string) => {
          order.push(`remember ${key}`)
          await repo.rememberKey(key)
        },
      } as never,
      files: {
        ...files,
        put: async (key: string, body: Uint8Array, options: never) => {
          order.push(`put ${key}`)
          return files.put(key, body, options)
        },
      } as never,
      images,
      random: () => 'k1',
    })

    await watched.stage(acceptFiles([{ filename: 'a.png', bytes: png() }], NO_LIMITS))
    expect(order).toEqual(['remember attachments/k1/source', 'put attachments/k1/source'])
  })

  it('stores an image under a source key and a PDF under a file key', async () => {
    const staged = await service.stage(
      acceptFiles(
        [
          { filename: 'a.png', bytes: png() },
          { filename: 'b.pdf', bytes: pdf() },
        ],
        NO_LIMITS,
      ),
    )

    expect(staged.map((s) => [s.key, s.opaque])).toEqual([
      ['attachments/k1/source', false],
      ['attachments/k2/file', true],
    ])
  })

  it('stores every object privately, even in a public forum', async () => {
    await service.stage(acceptFiles([{ filename: 'a.png', bytes: png() }], NO_LIMITS))
    expect([...files.objects.values()].every((o) => o.visibility === 'private')).toBe(true)
  })
})

describe('attaching', () => {
  it('creates a pending row for an image and forgets the key', async () => {
    const staged = await service.stage(
      acceptFiles([{ filename: 'a.png', bytes: png() }], NO_LIMITS),
    )
    const [row] = await service.attach(staged, POST)

    expect(row).toMatchObject({
      postId: 7,
      forumId: 3,
      status: 'pending',
      sourceKey: 'attachments/k1/source',
      storageKey: null,
    })
    expect(repo.keys.size).toBe(0)
  })

  it('creates a ready row for an opaque file', async () => {
    const staged = await service.stage(
      acceptFiles([{ filename: 'a.pdf', bytes: pdf() }], NO_LIMITS),
    )
    const [row] = await service.attach(staged, POST)

    expect(row).toMatchObject({
      status: 'ready',
      sourceKey: null,
      storageKey: 'attachments/k1/file',
    })
  })
})

describe('removing an attachment from an edited post', () => {
  it('deletes the row when it belongs to the post named', async () => {
    const staged = await service.stage(
      acceptFiles([{ filename: 'a.pdf', bytes: pdf() }], NO_LIMITS),
    )
    const [row] = await service.attach(staged, POST)

    expect(await service.removeFromPost(row!.id, POST.postId)).toMatchObject({ id: row!.id })
    expect(await repo.findById(row!.id)).toBeNull()
  })

  it('leaves an attachment on a different post alone', async () => {
    const staged = await service.stage(
      acceptFiles([{ filename: 'a.pdf', bytes: pdf() }], NO_LIMITS),
    )
    const [row] = await service.attach(staged, POST)

    expect(await service.removeFromPost(row!.id, 999)).toBeNull()
    expect(await repo.findById(row!.id)).not.toBeNull()
  })
})

describe('a standalone upload with no post yet', () => {
  const OWNER = { forumId: 3, uploaderUserId: 11 }

  it('creates a row with no post id, and forgets the key', async () => {
    const [accepted] = acceptFiles([{ filename: 'a.png', bytes: png() }], NO_LIMITS)
    const row = await service.uploadOrphan(accepted!, OWNER)

    expect(row).toMatchObject({ postId: null, forumId: 3, uploaderUserId: 11, status: 'pending' })
    expect(repo.keys.size).toBe(0)
  })

  it('is claimed by the post it was uploaded for', async () => {
    const [accepted] = acceptFiles([{ filename: 'a.png', bytes: png() }], NO_LIMITS)
    const row = await service.uploadOrphan(accepted!, OWNER)

    const claimed = await service.claim([row.id], {
      postId: 42,
      forumId: 3,
      uploaderUserId: 11,
    })

    expect(claimed.map((r) => r.id)).toEqual([row.id])
    expect((await repo.findById(row.id))?.postId).toBe(42)
  })

  it('refuses to claim someone else’s pending upload', async () => {
    const [accepted] = acceptFiles([{ filename: 'a.png', bytes: png() }], NO_LIMITS)
    const row = await service.uploadOrphan(accepted!, OWNER)

    const claimed = await service.claim([row.id], {
      postId: 42,
      forumId: 3,
      uploaderUserId: 999,
    })

    expect(claimed).toEqual([])
    expect((await repo.findById(row.id))?.postId).toBeNull()
  })

  it('refuses to claim one already spent on an earlier post', async () => {
    const [accepted] = acceptFiles([{ filename: 'a.png', bytes: png() }], NO_LIMITS)
    const row = await service.uploadOrphan(accepted!, OWNER)
    await service.claim([row.id], { postId: 42, forumId: 3, uploaderUserId: 11 })

    const claimed = await service.claim([row.id], { postId: 43, forumId: 3, uploaderUserId: 11 })
    expect(claimed).toEqual([])
    expect((await repo.findById(row.id))?.postId).toBe(42)
  })

  it('skips an id that does not exist, rather than throwing', async () => {
    const claimed = await service.claim([999], { postId: 42, forumId: 3, uploaderUserId: 11 })
    expect(claimed).toEqual([])
  })
})

describe('processing', () => {
  async function pendingImage() {
    const staged = await service.stage(
      acceptFiles([{ filename: 'a.png', bytes: png() }], NO_LIMITS),
    )
    const [row] = await service.attach(staged, POST)
    return row!
  }

  it('replaces the stored bytes with re-encoded ones and drops the original', async () => {
    const row = await pendingImage()
    expect(await service.process(row.id)).toBe('done')

    const after = (await repo.findById(row.id))!
    expect(after.status).toBe('ready')
    expect(after.sourceKey).toBeNull()
    expect(files.objects.has('attachments/k1/source')).toBe(false)
    expect(new TextDecoder().decode(files.objects.get(after.storageKey!)!.bytes)).toBe(
      'reencoded:png',
    )
  })

  it('records the dimensions the processor reports, not the ones claimed', async () => {
    const row = await pendingImage()
    await service.process(row.id)

    const after = (await repo.findById(row.id))!
    expect([after.width, after.height]).toEqual([800, 600])
    expect(after.sizeBytes).toBe(files.objects.get(after.storageKey!)!.bytes.length)
  })

  it('stores a thumbnail when the processor made one', async () => {
    const row = await pendingImage()
    await service.process(row.id)

    const after = (await repo.findById(row.id))!
    expect(after.thumbnailKey).toBe('attachments/k3/thumb')
    expect(repo.keys.size).toBe(0)
  })

  it('leaves no thumbnail key when the processor made none', async () => {
    images.withThumbnail = false
    const row = await pendingImage()
    await service.process(row.id)

    expect((await repo.findById(row.id))!.thumbnailKey).toBeNull()
  })

  it('is idempotent, because the queue is at-least-once', async () => {
    const row = await pendingImage()
    await service.process(row.id)
    expect(await service.process(row.id)).toBe('skipped')
    expect(images.calls).toBe(1)
    expect((await repo.findById(row.id))!.status).toBe('ready')
  })

  it('skips a row that does not exist', async () => {
    expect(await service.process(999)).toBe('skipped')
  })

  it('skips on the status alone, even if a source key is somehow still set', async () => {
    const row = await pendingImage()
    await service.process(row.id)
    repo.rows = repo.rows.map((r) => ({ ...r, sourceKey: 'attachments/k1/source' }))

    expect(await service.process(row.id)).toBe('skipped')
    expect(images.calls).toBe(1)
  })

  it('fails the row and drops the bytes when the decode fails', async () => {
    images.fail = true
    const row = await pendingImage()
    expect(await service.process(row.id)).toBe('failed')

    const after = (await repo.findById(row.id))!
    expect(after.status).toBe('failed')
    expect(after.failureReason).toMatch(/could not be read/)
    expect(files.objects.size).toBe(0)
    expect(repo.keys.size).toBe(0)
  })

  it('fails the row when the source object has vanished', async () => {
    const row = await pendingImage()
    files.objects.clear()

    expect(await service.process(row.id)).toBe('failed')
    expect((await repo.findById(row.id))!.failureReason).toMatch(/no longer available/)
  })
})

describe('the sweep', () => {
  it('deletes an object nothing ever claimed', async () => {
    await repo.rememberKey('attachments/lost/file')
    repo.keys.set(
      'attachments/lost/file',
      new Date(NOW.getTime() - (ORPHAN_GRACE_MINUTES + 1) * 60_000),
    )
    await files.put('attachments/lost/file', new Uint8Array([1]), {
      contentType: 'image/png',
      visibility: 'private',
    })

    expect(await service.sweep()).toMatchObject({ deleted: 1 })
    expect(files.objects.size).toBe(0)
    expect(repo.keys.size).toBe(0)
  })

  it('leaves an upload that is still in flight alone', async () => {
    await service.stage(acceptFiles([{ filename: 'a.png', bytes: png() }], NO_LIMITS))

    expect(await service.sweep()).toMatchObject({ deleted: 0 })
    expect(files.objects.size).toBe(1)
  })

  it('fails a row whose job never finished, and drops its source', async () => {
    const staged = await service.stage(
      acceptFiles([{ filename: 'a.png', bytes: png() }], NO_LIMITS),
    )
    const [row] = await service.attach(staged, POST)
    repo.rows = repo.rows.map((r) => ({
      ...r,
      createdAt: new Date(NOW.getTime() - (PROCESSING_GRACE_MINUTES + 1) * 60_000),
    }))

    expect(await service.sweep()).toMatchObject({ failed: 1 })

    const after = (await repo.findById(row!.id))!
    expect(after.status).toBe('failed')
    expect(after.failureReason).toMatch(/upload it again/)
    expect(files.objects.size).toBe(0)
  })

  it('leaves a job that is merely slow alone', async () => {
    const staged = await service.stage(
      acceptFiles([{ filename: 'a.png', bytes: png() }], NO_LIMITS),
    )
    await service.attach(staged, POST)

    expect(await service.sweep()).toMatchObject({ failed: 0 })
  })

  it('deletes an orphan upload nobody claimed, and its file with it', async () => {
    const [accepted] = acceptFiles([{ filename: 'a.png', bytes: png() }], NO_LIMITS)
    const row = await service.uploadOrphan(accepted!, { forumId: 3, uploaderUserId: 11 })
    repo.rows = repo.rows.map((r) =>
      r.id === row.id
        ? { ...r, createdAt: new Date(NOW.getTime() - (ORPHAN_GRACE_MINUTES + 1) * 60_000) }
        : r,
    )

    expect(await service.sweep()).toMatchObject({ deleted: 1 })
    expect(await repo.findById(row.id)).toBeNull()
    expect(files.objects.has(row.sourceKey!)).toBe(false)
  })

  it('leaves an orphan upload that is still inside its grace period alone', async () => {
    const [accepted] = acceptFiles([{ filename: 'a.png', bytes: png() }], NO_LIMITS)
    const row = await service.uploadOrphan(accepted!, { forumId: 3, uploaderUserId: 11 })

    expect(await service.sweep()).toMatchObject({ deleted: 0 })
    expect(await repo.findById(row.id)).not.toBeNull()
  })
})
