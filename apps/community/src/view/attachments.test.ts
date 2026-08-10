import { describe, expect, it } from 'vitest'

import type { AttachmentRecord } from '@meith/attachments'

import { attachmentModel, attachmentsByPost, formatBytes } from './attachments'

function record(overrides: Partial<AttachmentRecord> = {}): AttachmentRecord {
  return {
    id: 1,
    postId: 7,
    forumId: 3,
    uploaderUserId: 2,
    filename: 'photo.png',
    contentType: 'image/png',
    sizeBytes: 2048,
    storageKey: 'attachments/a/file',
    sourceKey: null,
    thumbnailKey: 'attachments/a/thumb',
    width: 800,
    height: 600,
    status: 'ready',
    failureReason: null,
    downloadCount: 0,
    createdAt: new Date(),
    ...overrides,
  }
}

describe('formatBytes', () => {
  it('uses the units a file manager uses', () => {
    expect(formatBytes(512)).toBe('512 bytes')
    expect(formatBytes(2048)).toBe('2 KB')
    expect(formatBytes(1_572_864)).toBe('1.5 MB')
  })
})

describe('attachmentModel', () => {
  it('maps a ready image with its thumbnail', () => {
    expect(attachmentModel(record())).toEqual({
      id: 1,
      filename: 'photo.png',
      size: '2 KB',
      isImage: true,
      href: '/attachment/1',
      thumbnailHref: '/attachment/1/thumb',
      width: 800,
      height: 600,
    })
  })

  it('offers no thumbnail for an image that already fits', () => {
    expect(attachmentModel(record({ thumbnailKey: null }))?.thumbnailHref).toBeNull()
  })

  it('marks a PDF as not an image, so no theme shows it inline', () => {
    const pdf = attachmentModel(
      record({ contentType: 'application/pdf', filename: 'notes.pdf', thumbnailKey: null }),
    )
    expect(pdf?.isImage).toBe(false)
    expect(pdf?.thumbnailHref).toBeNull()
  })

  it('drops an upload that has not been re-encoded yet', () => {
    expect(attachmentModel(record({ status: 'pending', storageKey: null }))).toBeNull()
  })

  it('drops one whose processing failed', () => {
    expect(attachmentModel(record({ status: 'failed', storageKey: null }))).toBeNull()
  })

  it('drops a row whose type this build no longer knows', () => {
    expect(attachmentModel(record({ contentType: 'image/gif' }))).toBeNull()
  })
})

describe('attachmentsByPost', () => {
  it('groups by post and keeps the repository order', () => {
    const grouped = attachmentsByPost([
      record({ id: 1, postId: 7 }),
      record({ id: 2, postId: 7 }),
      record({ id: 3, postId: 9 }),
    ])

    expect(grouped.get(7)?.map((a) => a.id)).toEqual([1, 2])
    expect(grouped.get(9)?.map((a) => a.id)).toEqual([3])
  })

  it('leaves a post out entirely when none of its files are ready', () => {
    const grouped = attachmentsByPost([record({ status: 'pending', storageKey: null })])
    expect(grouped.get(7)).toBeUndefined()
  })

  it('is empty for no rows', () => {
    expect(attachmentsByPost([]).size).toBe(0)
  })
})
