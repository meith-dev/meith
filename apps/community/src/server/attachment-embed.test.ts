import { beforeEach, describe, expect, it } from 'vitest'

import type { AttachmentRecord } from '@meith/attachments'

const { resolveInlineAttachments } = await import('./attachment-embed')
const { installTestContainer } = await import('./test-container')

function record(overrides: Partial<AttachmentRecord> = {}): AttachmentRecord {
  return {
    id: 5,
    postId: null,
    forumId: 1,
    uploaderUserId: 42,
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

class FakeAttachments {
  rows: readonly AttachmentRecord[] = []

  async findById(id: number) {
    return this.rows.find((row) => row.id === id) ?? null
  }
}

let attachments: FakeAttachments

function placeholder(id: number): string {
  return `<span class="md-attachment" data-attachment-id="${id}"></span>`
}

beforeEach(() => {
  attachments = new FakeAttachments()
  installTestContainer({ container: { attachments } })
})

describe('resolveInlineAttachments', () => {
  it('leaves html with no placeholder untouched, without asking the database', async () => {
    const html = '<p>nothing here</p>'
    expect(await resolveInlineAttachments(html, { viewerUserId: 42, postId: null })).toBe(html)
  })

  it('resolves an image the viewer uploaded, still unclaimed, into an inline image', async () => {
    attachments.rows = [record({ id: 5, uploaderUserId: 42, postId: null })]

    const out = await resolveInlineAttachments(`before ${placeholder(5)} after`, {
      viewerUserId: 42,
      postId: null,
    })

    expect(out).toContain('class="md-attachment md-attachment-image"')
    expect(out).toContain('/attachment/5/thumb')
    expect(out).not.toContain('data-attachment-id')
  })

  it('resolves a non-image into a plain download link with its filename', async () => {
    attachments.rows = [
      record({
        id: 5,
        uploaderUserId: 42,
        postId: null,
        contentType: 'application/pdf',
        thumbnailKey: null,
        width: null,
        height: null,
      }),
    ]

    const out = await resolveInlineAttachments(placeholder(5), { viewerUserId: 42, postId: null })
    expect(out).toContain('class="md-attachment md-attachment-file"')
    expect(out).toContain('photo.png')
  })

  it('resolves an attachment already claimed by the post being rendered', async () => {
    attachments.rows = [record({ id: 5, uploaderUserId: 99, postId: 7 })]

    const out = await resolveInlineAttachments(placeholder(5), { viewerUserId: 1, postId: 7 })
    expect(out).toContain('md-attachment')
  })

  it('drops an id nobody may place here, rather than leaking that it exists', async () => {
    attachments.rows = [record({ id: 5, uploaderUserId: 99, postId: null })]

    const out = await resolveInlineAttachments(`x${placeholder(5)}y`, {
      viewerUserId: 1,
      postId: null,
    })
    expect(out).toBe('xy')
  })

  it('drops an id claimed by a different post than the one being rendered', async () => {
    attachments.rows = [record({ id: 5, uploaderUserId: 99, postId: 7 })]

    const out = await resolveInlineAttachments(placeholder(5), { viewerUserId: 1, postId: 8 })
    expect(out).toBe('')
  })

  it('drops an id that does not exist', async () => {
    const out = await resolveInlineAttachments(placeholder(999), { viewerUserId: 1, postId: null })
    expect(out).toBe('')
  })

  it('drops an attachment that is not ready yet', async () => {
    attachments.rows = [
      record({ id: 5, uploaderUserId: 42, postId: null, status: 'pending', storageKey: null }),
    ]
    const out = await resolveInlineAttachments(placeholder(5), { viewerUserId: 42, postId: null })
    expect(out).toBe('')
  })

  it('resolves every distinct id once, however many times it is placed', async () => {
    attachments.rows = [record({ id: 5, uploaderUserId: 42, postId: null })]
    let lookups = 0
    attachments.findById = async (id: number) => {
      lookups += 1
      return attachments.rows.find((row) => row.id === id) ?? null
    }

    await resolveInlineAttachments(`${placeholder(5)}${placeholder(5)}`, {
      viewerUserId: 42,
      postId: null,
    })
    expect(lookups).toBe(1)
  })

  it('drops every placeholder when the board has no attachment store', async () => {
    installTestContainer({ container: { attachments: null } })
    const out = await resolveInlineAttachments(`x${placeholder(5)}y`, {
      viewerUserId: 42,
      postId: null,
    })
    expect(out).toBe('xy')
  })
})
