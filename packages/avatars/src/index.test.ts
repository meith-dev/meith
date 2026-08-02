import { ForbiddenError, ValidationError } from '@forum/core'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  AVATAR_BOX,
  AVATAR_MAX_BYTES,
  AVATAR_PROCESSING_GRACE_MINUTES,
  AvatarService,
  NO_AVATAR,
  avatarUrl,
  avatarVisible,
  type AvatarRepository,
  type StoredAvatar,
} from './index'

/** A PNG header declaring a size. All the validator parses. */
function png(width = 400, height = 300): Uint8Array {
  const bytes = new Uint8Array(64)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  bytes.set([0, 0, 0, 13], 8)
  bytes.set([0x49, 0x48, 0x44, 0x52], 12)
  new DataView(bytes.buffer).setUint32(16, width)
  new DataView(bytes.buffer).setUint32(20, height)
  return bytes
}

function pdf(): Uint8Array {
  return new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37])
}

const NOW = new Date('2026-08-02T12:00:00Z')
const ADA = 7

function stored(overrides: Partial<StoredAvatar> = {}): StoredAvatar {
  return { ...NO_AVATAR, ...overrides }
}

class FakeRepo implements AvatarRepository {
  rows = new Map<number, StoredAvatar>()
  keys = new Set<string>()
  locks: Array<{ userId: number; locked: boolean; reason: string | null }> = []

  async find(userId: number) {
    return this.rows.get(userId) ?? null
  }
  async readMany(userIds: readonly number[]) {
    const out = new Map<number, StoredAvatar>()
    for (const id of userIds) {
      const row = this.rows.get(id)
      if (row !== undefined) out.set(id, row)
    }
    return out
  }
  async beginUpload(input: { userId: number; sourceKey: string; at: Date }) {
    const previous = this.rows.get(input.userId)
    if (previous?.locked === true) return { replaced: [input.sourceKey] }

    const replaced = [previous?.key, previous?.sourceKey].filter(
      (key): key is string => key != null,
    )
    this.rows.set(input.userId, {
      ...stored(),
      status: 'pending',
      sourceKey: input.sourceKey,
      updatedAt: input.at,
    })
    return { replaced }
  }
  async markReady(input: { userId: number; key: string; width: number; height: number }) {
    const row = this.rows.get(input.userId)
    if (row?.status !== 'pending') return
    this.rows.set(input.userId, {
      ...row,
      status: 'ready',
      key: input.key,
      sourceKey: null,
      width: input.width,
      height: input.height,
    })
  }
  async markFailed(userId: number, reason: string) {
    const row = this.rows.get(userId)
    if (row?.status !== 'pending') return
    this.rows.set(userId, {
      ...row,
      status: 'failed',
      failureReason: reason,
      sourceKey: null,
    })
  }
  async clear(userId: number) {
    const row = this.rows.get(userId)
    if (row === undefined || row.locked) return { replaced: [] }
    this.rows.set(userId, stored())
    return {
      replaced: [row.key, row.sourceKey].filter((key): key is string => key != null),
    }
  }
  async lock(input: { userId: number; locked: boolean; reason: string | null }) {
    this.locks.push(input)
    const row = this.rows.get(input.userId) ?? stored()
    this.rows.set(input.userId, {
      ...row,
      locked: input.locked,
      lockedReason: input.reason,
    })
  }
  async stalled(before: Date, limit: number) {
    return [...this.rows]
      .filter(
        ([, row]) =>
          row.status === 'pending' && row.updatedAt !== null && row.updatedAt < before,
      )
      .slice(0, limit)
      .map(([id]) => id)
  }
  async rememberKey(key: string) {
    this.keys.add(key)
  }
  async forgetKeys(keys: readonly string[]) {
    for (const key of keys) this.keys.delete(key)
  }
}

class FakeFiles {
  objects = new Map<string, { bytes: Uint8Array; visibility: string }>()
  async put(key: string, body: Uint8Array, options: { contentType: string; visibility: string }) {
    this.objects.set(key, { bytes: body, visibility: options.visibility })
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

class FakeImages {
  fail = false
  calls: Array<Record<string, unknown>> = []
  async process(input: Record<string, unknown>) {
    this.calls.push(input)
    if (this.fail) throw new Error('nope')
    return {
      bytes: new TextEncoder().encode('re-encoded'),
      contentType: 'image/png',
      width: 200,
      height: 150,
    }
  }
}

let repo: FakeRepo
let files: FakeFiles
let images: FakeImages
let service: AvatarService
let counter: number

beforeEach(() => {
  repo = new FakeRepo()
  files = new FakeFiles()
  images = new FakeImages()
  counter = 0
  service = new AvatarService({
    avatars: repo,
    files: files as never,
    images,
    random: () => `k${(counter += 1)}`,
    now: () => NOW,
  })
})

describe('avatarVisible', () => {
  it('is false until the re-encode has finished', () => {
    /*
     * The claim the whole lifecycle exists for: what a member uploaded is never
     * shown. Kills the mutant that treats a pending row as displayable.
     */
    expect(avatarVisible(stored({ status: 'pending', sourceKey: 'k' }))).toBe(false)
    expect(avatarVisible(stored({ status: 'failed' }))).toBe(false)
    expect(avatarVisible(stored())).toBe(false)
    expect(avatarVisible(stored({ status: 'ready', key: 'k' }))).toBe(true)
  })

  it('is false while locked, whatever the status says', () => {
    /*
     * A locked avatar reads exactly like no avatar to everybody except its
     * owner. Kills the mutant that drops the lock from the predicate — which
     * would leave a moderator's decision applying to the edit form and not to
     * the thing everybody actually sees.
     */
    expect(avatarVisible(stored({ status: 'ready', key: 'k', locked: true }))).toBe(false)
  })
})

describe('avatarUrl', () => {
  it('carries the member and a version, and never the object key', () => {
    /*
     * A key in a URL is a capability, and one that outlives a lock. The version
     * is what makes a replacement a different URL, so no cache keeps showing
     * the old face.
     */
    const url = avatarUrl(ADA, stored({ status: 'ready', key: 'secret', updatedAt: NOW }))
    expect(url).toBe(`/avatar/${ADA}?v=${NOW.getTime()}`)
    expect(url).not.toContain('secret')
  })

  it('is null for anything not visible', () => {
    expect(avatarUrl(ADA, stored({ status: 'pending' }))).toBeNull()
    expect(avatarUrl(ADA, stored({ status: 'ready', key: 'k', locked: true }))).toBeNull()
  })
})

describe('uploading', () => {
  it('stores the original privately and marks the row pending', async () => {
    await service.upload({ userId: ADA, file: { filename: 'me.png', bytes: png() }, mayUpload: true })

    expect(await repo.find(ADA)).toMatchObject({
      status: 'pending',
      sourceKey: 'attachments/k1/source',
      key: null,
    })
    expect([...files.objects.values()][0]?.visibility).toBe('private')
    /* The ledger handed the key over to the row. */
    expect(repo.keys.size).toBe(0)
  })

  it('refuses somebody without the permission', async () => {
    await expect(
      service.upload({ userId: ADA, file: { filename: 'me.png', bytes: png() }, mayUpload: false }),
    ).rejects.toThrow(ForbiddenError)
    expect(files.objects.size).toBe(0)
  })

  it('refuses while locked, and stores nothing', async () => {
    /*
     * The lock is checked here rather than left to the caller because it is a
     * sanction on one member and not a permission — a caller that had to
     * remember it would eventually not. Kills the mutant that drops the check.
     */
    repo.rows.set(ADA, stored({ locked: true, lockedReason: 'no' }))

    await expect(
      service.upload({ userId: ADA, file: { filename: 'me.png', bytes: png() }, mayUpload: true }),
    ).rejects.toThrow(/locked/)
    expect(files.objects.size).toBe(0)
  })

  it('refuses a format that is not an image, even though F42 would take it', async () => {
    /*
     * A PDF is a legitimate attachment and an absurd avatar. Kills the mutant
     * that reuses `acceptFile` without narrowing it.
     */
    await expect(
      service.upload({ userId: ADA, file: { filename: 'cv.pdf', bytes: pdf() }, mayUpload: true }),
    ).rejects.toThrow(/PNG or a JPEG/)
  })

  it('refuses one over the avatar ceiling, well below F42’s', async () => {
    const big = new Uint8Array(AVATAR_MAX_BYTES + 1024)
    big.set(png())

    await expect(
      service.upload({ userId: ADA, file: { filename: 'huge.png', bytes: big }, mayUpload: true }),
    ).rejects.toThrow(ValidationError)
  })

  it('hands the previous object to the sweep rather than leaking it', async () => {
    /*
     * The difference between an avatar and an attachment: this is an overwrite,
     * so something has to collect what it replaced. Kills the mutant that
     * ignores `replaced`.
     */
    repo.rows.set(ADA, stored({ status: 'ready', key: 'attachments/old/file' }))
    files.objects.set('attachments/old/file', { bytes: new Uint8Array([1]), visibility: 'private' })

    await service.upload({ userId: ADA, file: { filename: 'me.png', bytes: png() }, mayUpload: true })

    expect(files.objects.has('attachments/old/file')).toBe(false)
    expect(files.objects.has('attachments/k1/source')).toBe(true)
  })
})

describe('processing', () => {
  async function pending() {
    await service.upload({ userId: ADA, file: { filename: 'me.png', bytes: png() }, mayUpload: true })
  }

  it('serves the encoder’s output and drops the uploaded bytes', async () => {
    await pending()
    expect(await service.process(ADA)).toBe('done')

    const after = (await repo.find(ADA))!
    expect(after.status).toBe('ready')
    expect(after.sourceKey).toBeNull()
    expect(files.objects.has('attachments/k1/source')).toBe(false)
    expect(new TextDecoder().decode(files.objects.get(after.key!)!.bytes)).toBe('re-encoded')
  })

  it('asks for the avatar box and no thumbnail', async () => {
    /*
     * An avatar renders at a fixed size on every page of the board, so storing
     * a 2000px original is a cost paid by every reader; and a thumbnail of a
     * 200px image is a second lossy encode of something nothing asks for.
     */
    await pending()
    await service.process(ADA)

    expect(images.calls[0]).toMatchObject({ fit: AVATAR_BOX, thumbnail: false })
  })

  it('records the dimensions the processor reports', async () => {
    await pending()
    await service.process(ADA)

    expect(await repo.find(ADA)).toMatchObject({ width: 200, height: 150 })
  })

  it('is idempotent, because the queue is at-least-once', async () => {
    await pending()
    await service.process(ADA)

    expect(await service.process(ADA)).toBe('skipped')
    expect(images.calls).toHaveLength(1)
  })

  it('fails the row and drops the bytes when the decode fails', async () => {
    images.fail = true
    await pending()

    expect(await service.process(ADA)).toBe('failed')
    expect(await repo.find(ADA)).toMatchObject({ status: 'failed', sourceKey: null })
    expect(files.objects.size).toBe(0)
  })

  it('fails the row when the uploaded object has vanished', async () => {
    await pending()
    files.objects.clear()

    expect(await service.process(ADA)).toBe('failed')
    expect((await repo.find(ADA))?.failureReason).toMatch(/no longer available/)
  })

  it('fails a row whose stored bytes are not an image after all', async () => {
    /*
     * The case the re-encode exists to catch, reached from the other side: the
     * header checks passed at upload and the file is still not decodable.
     */
    await pending()
    files.objects.set('attachments/k1/source', {
      bytes: new TextEncoder().encode('<?php ?>'),
      visibility: 'private',
    })

    expect(await service.process(ADA)).toBe('failed')
    expect((await repo.find(ADA))?.failureReason).toMatch(/could not be read/)
  })
})

describe('removing', () => {
  it('clears the row and sweeps the object', async () => {
    repo.rows.set(ADA, stored({ status: 'ready', key: 'attachments/old/file' }))
    files.objects.set('attachments/old/file', { bytes: new Uint8Array([1]), visibility: 'private' })

    await service.remove(ADA)

    expect(await repo.find(ADA)).toMatchObject({ status: 'none', key: null })
    expect(files.objects.size).toBe(0)
  })

  it('is refused while locked', async () => {
    repo.rows.set(ADA, stored({ status: 'ready', key: 'k', locked: true }))
    await expect(service.remove(ADA)).rejects.toThrow(/locked/)
  })
})

describe('the moderator lock', () => {
  it('requires a reason to lock, and clears it to unlock', async () => {
    /*
     * D61's rule: "your avatar has been locked" with no reason is how somebody
     * concludes the board is broken rather than that they broke a rule.
     */
    await expect(
      service.setLock({ userId: ADA, locked: true, reason: '   ' }),
    ).rejects.toThrow(ValidationError)

    await service.setLock({ userId: ADA, locked: true, reason: ' not suitable ' })
    expect(repo.locks.at(-1)).toEqual({ userId: ADA, locked: true, reason: 'not suitable' })

    await service.setLock({ userId: ADA, locked: false, reason: '' })
    expect(repo.locks.at(-1)).toEqual({ userId: ADA, locked: false, reason: null })
  })

  it('keeps the object, so an appeal has something to look at', async () => {
    /*
     * The argument is stronger here than for a signature: deleting an image
     * destroys the evidence entirely, where a deleted signature at least leaves
     * a description possible.
     */
    repo.rows.set(ADA, stored({ status: 'ready', key: 'attachments/old/file' }))
    files.objects.set('attachments/old/file', { bytes: new Uint8Array([1]), visibility: 'private' })

    await service.setLock({ userId: ADA, locked: true, reason: 'no' })

    expect(files.objects.has('attachments/old/file')).toBe(true)
    expect((await repo.find(ADA))?.key).toBe('attachments/old/file')
  })
})

describe('the sweep', () => {
  it('fails an upload whose job never finished, and drops its bytes', async () => {
    await service.upload({ userId: ADA, file: { filename: 'me.png', bytes: png() }, mayUpload: true })
    repo.rows.set(ADA, {
      ...(await repo.find(ADA))!,
      updatedAt: new Date(NOW.getTime() - (AVATAR_PROCESSING_GRACE_MINUTES + 1) * 60_000),
    })

    expect(await service.sweep()).toBe(1)
    expect(await repo.find(ADA)).toMatchObject({ status: 'failed', sourceKey: null })
    expect(files.objects.size).toBe(0)
  })

  it('leaves a job that is merely slow alone', async () => {
    /*
     * The grace period. Kills the mutant that fails everything pending, which
     * would break every upload on a board whose tick runs before its queue.
     */
    await service.upload({ userId: ADA, file: { filename: 'me.png', bytes: png() }, mayUpload: true })

    expect(await service.sweep()).toBe(0)
    expect((await repo.find(ADA))?.status).toBe('pending')
  })
})
