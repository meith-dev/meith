/**
 * F42's view model.
 *
 * Pure, and the one place that decides what a reader sees of an attachment. Two
 * rules are proven here because they exist nowhere else: only downloadable rows
 * reach a theme, and a size is formatted once.
 */
import { describe, expect, it } from 'vitest'

import type { AttachmentRecord } from '@meith/attachments'

import { attachmentModel, attachmentsByPost, formatBytes } from './attachments'

function record(overrides: Partial<AttachmentRecord> = {}): AttachmentRecord {
  return {
    id: 1,
    postId: 7,
    communityId: 3,
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
    /*
     * `resizeToFit` declined to shrink it, so the processor stored no second
     * object. A theme writes `thumbnailHref ?? href` and gets the right picture.
     */
    expect(attachmentModel(record({ thumbnailKey: null }))?.thumbnailHref).toBeNull()
  })

  it('marks a PDF as not an image, so no theme shows it inline', () => {
    /*
     * The board does not parse PDFs and will not pretend to preview one. Kills
     * the mutant that reports every attachment as an image.
     */
    const pdf = attachmentModel(
      record({ contentType: 'application/pdf', filename: 'notes.pdf', thumbnailKey: null }),
    )
    expect(pdf?.isImage).toBe(false)
    expect(pdf?.thumbnailHref).toBeNull()
  })

  it('drops an upload that has not been re-encoded yet', () => {
    /*
     * The rule that keeps a link out of the page until the file behind it
     * exists. Kills the mutant that renders every row.
     */
    expect(attachmentModel(record({ status: 'pending', storageKey: null }))).toBeNull()
  })

  it('drops one whose processing failed', () => {
    expect(attachmentModel(record({ status: 'failed', storageKey: null }))).toBeNull()
  })

  it('drops a row whose type this build no longer knows', () => {
    /* A row written by a deploy that accepted GIFs. Rendered as a link it would
       claim the board can serve something it cannot describe. */
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
    /*
     * Not an empty array for that post: a theme renders the heading when the
     * list is non-empty, and a post whose only image is still processing must
     * not get an empty "Attachments" block.
     */
    const grouped = attachmentsByPost([record({ status: 'pending', storageKey: null })])
    expect(grouped.get(7)).toBeUndefined()
  })

  it('is empty for no rows', () => {
    expect(attachmentsByPost([]).size).toBe(0)
  })
})
