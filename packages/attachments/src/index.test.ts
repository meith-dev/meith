import { ValidationError } from '@meith/core'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  ATTACHMENT_TYPES,
  AttachmentService,
  HARD_MAX_BYTES,
  HARD_MAX_PER_POST,
  MAX_MEGAPIXELS,
  ORPHAN_GRACE_MINUTES,
  PROCESSING_GRACE_MINUTES,
  acceptFile,
  acceptFiles,
  attachmentType,
  declaredDimensions,
  maxBytesFor,
  maxPerPostFor,
  sanitiseFilename,
  sniff,
  storageKeyFor,
  type AttachmentRecord,
  type AttachmentRepository,
  type CreateAttachmentInput,
  type IncomingFile,
  type ImageProcessor,
  type ReadyInput,
} from './index'

/* ------------------------------------------------------------------ *
 * Sample files
 * ------------------------------------------------------------------ */

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** A PNG header declaring a size, with no pixel data. That is all we parse. */
function png(width = 10, height = 10): Uint8Array {
  const bytes = new Uint8Array(64)
  bytes.set(PNG_SIGNATURE)
  bytes.set([0, 0, 0, 13], 8) // IHDR length
  bytes.set([0x49, 0x48, 0x44, 0x52], 12) // "IHDR"
  new DataView(bytes.buffer).setUint32(16, width)
  new DataView(bytes.buffer).setUint32(20, height)
  return bytes
}

/** A JPEG with an APP0 segment in front of the frame header, as real ones have. */
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

/* ------------------------------------------------------------------ *
 * Sniffing
 * ------------------------------------------------------------------ */

describe('sniff', () => {
  it('identifies each accepted format from its bytes', () => {
    expect(sniff(png())?.contentType).toBe('image/png')
    expect(sniff(jpeg())?.contentType).toBe('image/jpeg')
    expect(sniff(pdf())?.contentType).toBe('application/pdf')
    expect(sniff(zip())?.contentType).toBe('application/zip')
  })

  it('checks the whole PNG signature, not the first four bytes', () => {
    /*
     * The trailing CR/LF/EOF bytes exist to catch a transfer that mangled line
     * endings. Kills the mutant that compares a prefix of the signature.
     */
    const mangled = png()
    mangled[6] = 0x00 // the EOF byte, last of the eight
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
    /* Kills the mutant that drops the length check and reads past the end,
       where `undefined === undefined` would make an empty file every format. */
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

/* ------------------------------------------------------------------ *
 * Dimensions
 * ------------------------------------------------------------------ */

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
    /*
     * The whole reason the JPEG side is a walk rather than a fixed offset: EXIF
     * and colour profiles sit before SOF0, and a parser that assumed an offset
     * would read a camera's metadata as a size.
     */
    expect(declaredDimensions(jpeg(800, 600, 3), jpegType)).toEqual({
      width: 800,
      height: 600,
    })
  })

  it('refuses a PNG whose IHDR is not first', () => {
    const odd = png()
    odd.set([0x74, 0x45, 0x58, 0x74], 12) // "tEXt"
    expect(declaredDimensions(odd, pngType)).toBeUndefined()
  })

  it('refuses a zero dimension, which no decoder can use', () => {
    expect(declaredDimensions(png(0, 10), pngType)).toBeUndefined()
    expect(declaredDimensions(jpeg(10, 0), jpegType)).toBeUndefined()
  })

  it('terminates on a segment whose length does not move forward', () => {
    /*
     * A segment declaring length 0 would leave the cursor where it was. Kills
     * the mutant that drops the `length < 2` check, which turns a crafted file
     * into an infinite loop in a request handler.
     */
    const hostile = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00, 0, 0, 0, 0])
    expect(declaredDimensions(hostile, jpegType)).toBeUndefined()
  })

  it('returns nothing for a format that has no dimensions', () => {
    expect(declaredDimensions(pdf(), attachmentType('application/pdf')!)).toBeUndefined()
  })
})

/* ------------------------------------------------------------------ *
 * Filenames
 * ------------------------------------------------------------------ */

describe('sanitiseFilename', () => {
  const pngType = attachmentType('image/png')!
  const zipType = attachmentType('application/zip')!

  it('keeps an ordinary name', () => {
    expect(sanitiseFilename('holiday photo.png', pngType)).toBe('holiday photo.png')
  })

  it('gives the file the extension its content implies, not the one claimed', () => {
    /*
     * The rule that stops a download's name from disagreeing with its bytes.
     * `invoice.pdf.exe` full of PNG is stored as a PNG and says so.
     */
    expect(sanitiseFilename('invoice.pdf.exe', pngType)).toBe('invoice.pdf.png')
    expect(sanitiseFilename('report.png', zipType)).toBe('report.zip')
  })

  it('drops any path the browser sent', () => {
    expect(sanitiseFilename('C:\\Users\\ada\\secret.png', pngType)).toBe('secret.png')
    expect(sanitiseFilename('../../etc/passwd', pngType)).toBe('passwd.png')
  })

  it('removes characters a header or a page would choke on', () => {
    /*
     * The name is echoed into `Content-Disposition`. A newline there is
     * response splitting, and no amount of care at the call site is as reliable
     * as the character never being in the string.
     */
    const nasty = sanitiseFilename('a\r\nb<script>"x".png', pngType)
    expect(nasty).not.toMatch(/[\r\n<>"]/)
    expect(nasty.endsWith('.png')).toBe(true)
  })

  it('never returns something that starts with a dot or is only an extension', () => {
    expect(sanitiseFilename('...', pngType)).toBe('file.png')
    /* `.htaccess` is *all* extension, so dropping the claimed one leaves
       nothing — which is the correct reading of a name that is only a suffix. */
    expect(sanitiseFilename('.htaccess', pngType)).toBe('file.png')
    expect(sanitiseFilename('', pngType)).toBe('file.png')
  })

  it('bounds the length', () => {
    expect(sanitiseFilename(`${'a'.repeat(400)}.png`, pngType).length).toBeLessThanOrEqual(100)
  })
})

describe('storageKeyFor', () => {
  it('is random and unrelated to the filename', () => {
    /*
     * Guessability is the point: a key derived from an id or a name would let
     * somebody read a private forum's attachment straight out of a bucket.
     */
    let n = 0
    const key = storageKeyFor('source', () => `r${(n += 1)}`)
    expect(key).toBe('attachments/r1/source')
    expect(storageKeyFor('thumb', () => 'r2')).toBe('attachments/r2/thumb')
  })
})

/* ------------------------------------------------------------------ *
 * Acceptance
 * ------------------------------------------------------------------ */

describe('limits', () => {
  it('treats 0 as unlimited, bounded by the hard ceiling', () => {
    expect(maxBytesFor({ maxPerPost: 0, maxSizeKb: 0 })).toBe(HARD_MAX_BYTES)
    expect(maxPerPostFor({ maxPerPost: 0, maxSizeKb: 0 })).toBe(HARD_MAX_PER_POST)
  })

  it('never lets a configured value exceed the ceiling', () => {
    /*
     * Same argument as F58's signature limit: an operator with a slipped
     * keyboard must not be able to configure a way to fill the disk. Kills the
     * mutant that returns the configured value directly.
     */
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
    /*
     * The claim can say anything. Kills any mutant that lets the filename
     * influence the accepted type — which is the bug that makes an upload
     * filter a suggestion.
     */
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
    expect(() => acceptFile({ filename: 'big.png', bytes: big }, { maxPerPost: 0, maxSizeKb: 64 })).toThrow(
      /“big.png”[\s\S]*limit/,
    )
  })

  it('refuses a decompression bomb, which no size limit catches', () => {
    /*
     * The whole reason `dimensions.ts` exists. This file is 64 bytes and
     * declares 30,000 x 30,000 — 3.6 GB once decoded. Kills the mutant that
     * drops the megapixel check.
     */
    expect(() => acceptFile({ filename: 'bomb.png', bytes: png(30_000, 30_000) }, NO_LIMITS)).toThrow(
      /megapixel/,
    )
  })

  it('accepts an image just inside the megapixel limit', () => {
    const side = Math.floor(Math.sqrt(MAX_MEGAPIXELS * 1_000_000)) - 1
    expect(() => acceptFile({ filename: 'ok.png', bytes: png(side, side) }, NO_LIMITS)).not.toThrow()
  })

  it('refuses an image whose header cannot be read', () => {
    /*
     * Refused rather than passed to the decoder to find out — the decode is the
     * thing being protected.
     */
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
    /*
     * An edit that adds a fifth file to a post with four must meet the same cap
     * as posting five at once. Kills the mutant that ignores `existing`.
     */
    expect(() => acceptFiles([four[0]!], { maxPerPost: 4, maxSizeKb: 0 }, 4)).toThrow(
      /at most 4/,
    )
  })

  it('refuses the whole submission when one file is bad', () => {
    /* All-or-nothing: a post with three of its four images is not what anybody
       asked for, and there is no way to tell them which one went missing. */
    expect(() =>
      acceptFiles([four[0]!, { filename: 'bad.txt', bytes: new TextEncoder().encode('hello') }], NO_LIMITS),
    ).toThrow(ValidationError)
  })
})

/* ------------------------------------------------------------------ *
 * The service
 * ------------------------------------------------------------------ */

class FakeRepo implements AttachmentRepository {
  rows: AttachmentRecord[] = []
  keys = new Map<string, Date>()
  nextId = 1
  /* The same clock the service is given: a fake that used the wall clock would
     make every sweep test depend on what time the suite happened to run. */
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
      : { record, postVisibility: 'visible', threadVisibility: 'visible' }
  }
  async listForPosts(postIds: readonly number[]) {
    return this.rows.filter((row) => postIds.includes(row.postId))
  }
  async countForPost(postId: number) {
    return this.rows.filter((row) => row.postId === postId).length
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
    random: () => `k${(counter += 1)}`,
    now: () => NOW,
  })
})

const POST = { postId: 7, forumId: 3, userId: 11 }

describe('staging', () => {
  it('remembers the key before the object exists', async () => {
    /*
     * The ordering the whole orphan story rests on. A process that dies between
     * the put and the row must leave something that names the bytes; a ledger
     * written *after* the put would not.
     */
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
    /* An opaque file has no transformation to wait for, so it is stored once
       and is finished. An image's original is quarantined. */
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
    /*
     * The permission that governs a download is forum-scoped, and a public
     * object is one nobody can revoke — moving a thread into a private forum
     * would otherwise not take its images with it.
     */
    await service.stage(acceptFiles([{ filename: 'a.png', bytes: png() }], NO_LIMITS))
    expect([...files.objects.values()].every((o) => o.visibility === 'private')).toBe(true)
  })
})

describe('attaching', () => {
  it('creates a pending row for an image and forgets the key', async () => {
    const staged = await service.stage(acceptFiles([{ filename: 'a.png', bytes: png() }], NO_LIMITS))
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
    const staged = await service.stage(acceptFiles([{ filename: 'a.pdf', bytes: pdf() }], NO_LIMITS))
    const [row] = await service.attach(staged, POST)

    expect(row).toMatchObject({ status: 'ready', sourceKey: null, storageKey: 'attachments/k1/file' })
  })
})

describe('processing', () => {
  async function pendingImage() {
    const staged = await service.stage(acceptFiles([{ filename: 'a.png', bytes: png() }], NO_LIMITS))
    const [row] = await service.attach(staged, POST)
    return row!
  }

  it('replaces the stored bytes with re-encoded ones and drops the original', async () => {
    /*
     * The claim the whole feature exists for. After processing, the object the
     * board serves is the encoder's output and the uploaded bytes are gone.
     */
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
    /*
     * Kills the mutant that drops the status guard: a second delivery would
     * re-encode from a source that is gone, and mark a ready row failed.
     */
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
    /*
     * Same argument as the app-layer download check: `markReady` clears the
     * source key and sets the status in one statement, so the two always agree.
     * Asserting the status is sufficient on its own is what makes that a
     * guarantee — otherwise the guard is shadowed by the key check and deleting
     * it passes every other test here.
     */
    const row = await pendingImage()
    await service.process(row.id)
    repo.rows = repo.rows.map((r) => ({ ...r, sourceKey: 'attachments/k1/source' }))

    expect(await service.process(row.id)).toBe('skipped')
    expect(images.calls).toBe(1)
  })

  it('fails the row and drops the bytes when the decode fails', async () => {
    /*
     * A file that passed the header checks and is still not an image is exactly
     * what the re-encode exists to catch, so this is a normal outcome — the
     * uploader is told why, and the bytes do not survive.
     */
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
    /*
     * The grace period is what makes the sweep safe at all: a key is remembered
     * *before* its object is written, so a sweep with no grace would race every
     * upload and delete the bytes out from under it. Kills the mutant that
     * sweeps everything in the ledger.
     */
    await service.stage(acceptFiles([{ filename: 'a.png', bytes: png() }], NO_LIMITS))

    expect(await service.sweep()).toMatchObject({ deleted: 0 })
    expect(files.objects.size).toBe(1)
  })

  it('fails a row whose job never finished, and drops its source', async () => {
    const staged = await service.stage(acceptFiles([{ filename: 'a.png', bytes: png() }], NO_LIMITS))
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
    const staged = await service.stage(acceptFiles([{ filename: 'a.png', bytes: png() }], NO_LIMITS))
    await service.attach(staged, POST)

    expect(await service.sweep()).toMatchObject({ failed: 0 })
  })
})
