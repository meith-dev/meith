import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AttachmentForDownload, AttachmentRecord } from '@meith/attachments'
import type { Actor } from '@meith/authorization'
import { combinePermissionSets, InMemoryAuthorizationSource } from '@meith/authorization'

const actorRef: { current: Actor | null } = { current: null }
vi.mock('./context', () => ({ getActor: async () => actorRef.current }))

const objects = new Map<string, Uint8Array>()
const enqueued: Array<{ kind: string; payload: unknown }> = []
vi.mock('@meith/drivers', () => ({
  drivers: () => ({
    files: {
      async put(key: string, body: Uint8Array) {
        objects.set(key, body)
        return { key, size: body.length, contentType: 'image/png' }
      },
      async get(key: string) {
        return objects.get(key)
      },
      async delete(key: string) {
        objects.delete(key)
      },
      async signedUrl() {
        return undefined
      },
      url: (key: string) => `/files/${key}`,
    },
    queue: {
      async enqueue(kind: string, payload: unknown) {
        enqueued.push({ kind, payload })
        return { id: '1', deduplicated: false }
      },
    },
  }),
}))

vi.mock('@meith/drivers/images', () => ({
  imageProcessor: {
    async process() {
      throw new Error('not used in this suite')
    },
  },
}))

const { attachmentLimits, canAttach, resolveDownload, stageAttachments, submittedFiles } =
  await import('./attachments')
const { SEED_BOARD, SEED_GROUP, SEED_FORUM } = await import('./seed-board')
const { installTestContainer } = await import('./test-container')

const ADA = 1
const PUBLIC_FORUM = SEED_FORUM.general

const PNG = new Uint8Array(64)
PNG.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
PNG.set([0, 0, 0, 13], 8)
PNG.set([0x49, 0x48, 0x44, 0x52], 12)
new DataView(PNG.buffer).setUint32(16, 10)
new DataView(PNG.buffer).setUint32(20, 10)

function record(overrides: Partial<AttachmentRecord> = {}): AttachmentRecord {
  return {
    id: 5,
    postId: 9,
    forumId: PUBLIC_FORUM,
    uploaderUserId: ADA,
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
  found: AttachmentForDownload | null = {
    record: record(),
    postVisibility: 'visible',
    threadVisibility: 'visible',
    threadAuthorUserId: null,
  }
  created: unknown[] = []
  downloads: number[] = []

  async findForDownload() {
    return this.found
  }
  async findById() {
    return this.found?.record ?? null
  }
  async listForPosts() {
    return []
  }
  async countForPost() {
    return 0
  }
  async create(input: Record<string, unknown>) {
    this.created.push(input)
    return record({ id: this.created.length, status: input.status as 'pending' | 'ready' })
  }
  async markReady() {}
  async markFailed() {}
  async recordDownload(id: number) {
    this.downloads.push(id)
  }
  async stalled() {
    return []
  }
  async rememberKey() {}
  async forgetKeys() {}
  async staleKeys() {
    return []
  }
}

let attachments: FakeAttachments

async function actorFor(groupId: number, userId: number | null): Promise<Actor> {
  const source = new InMemoryAuthorizationSource(SEED_BOARD)
  const defaults = await source.groupDefaults([groupId])
  return {
    userId,
    groupIds: [groupId],
    primaryGroupId: groupId,
    state: userId === null ? 'guest' : 'active',
    global: combinePermissionSets(defaults.map((d) => d.permissions)),
    permissionVersion: 1,
  }
}

async function scope(actor: Actor, { forumId = PUBLIC_FORUM, allowsAttachments = true } = {}) {
  const installed = (
    globalThis as Record<
      symbol,
      { authorizer: { forumMatrix(a: Actor, id: number): Promise<unknown> } }
    >
  )[Symbol.for('@meith/forum.container')]!

  return {
    forumId,
    forum: (await installed.authorizer.forumMatrix(actor, forumId)) as never,
    allowsAttachments,
  }
}

beforeEach(async () => {
  objects.clear()
  enqueued.length = 0
  attachments = new FakeAttachments()
  installTestContainer({ container: { attachments } })
  actorRef.current = await actorFor(SEED_GROUP.registered, ADA)
})

describe('the composer control', () => {
  it('is offered to a member who may upload', async () => {
    const actor = actorRef.current!
    expect(canAttach(actor, await scope(actor))).toBe(true)
  })

  it('is absent when the board has no attachment store', async () => {
    installTestContainer({ container: { attachments: null } })
    const actor = actorRef.current!
    expect(canAttach(actor, await scope(actor))).toBe(false)
  })

  it('is absent for a guest', async () => {
    const guest = await actorFor(SEED_GROUP.guest, null)
    expect(canAttach(guest, await scope(guest))).toBe(false)
  })

  it('is absent in a forum that does not take attachments, permission or not', async () => {
    const actor = actorRef.current!
    expect(canAttach(actor, await scope(actor, { allowsAttachments: false }))).toBe(false)
  })
})

describe('the limits shown on the form', () => {
  it('are the resolved forum matrix, with 0 left as 0 for the domain to read', async () => {
    const actor = actorRef.current!
    expect(attachmentLimits(await scope(actor))).toEqual({
      maxPerPost: 0,
      maxSizeKb: 0,
    })
  })
})

describe('submittedFiles', () => {
  it('ignores an untouched file input', async () => {
    const form = new FormData()
    form.append('attachments', new File([], ''))
    expect(await submittedFiles(form)).toEqual([])
  })

  it('reads the files that are there', async () => {
    const form = new FormData()
    form.append('attachments', new File([PNG], 'a.png'))
    form.append('attachments', new File([PNG], 'b.png'))

    const files = await submittedFiles(form)
    expect(files.map((f) => f.filename)).toEqual(['a.png', 'b.png'])
    expect(files[0]?.bytes.length).toBe(PNG.length)
  })
})

describe('staging', () => {
  it('stores nothing and asks nothing when no file was attached', async () => {
    const guest = await actorFor(SEED_GROUP.guest, null)
    expect(await stageAttachments(guest, await scope(guest), [])).toEqual([])
    expect(objects.size).toBe(0)
  })

  it('refuses a member without `attachment.upload` in this forum', async () => {
    const guest = await actorFor(SEED_GROUP.guest, null)
    await expect(
      stageAttachments(guest, await scope(guest), [{ filename: 'a.png', bytes: PNG }]),
    ).rejects.toThrow(/may not attach/)
    expect(objects.size).toBe(0)
  })

  it('refuses a member with the permission in a forum that takes no attachments', async () => {
    const actor = actorRef.current!
    await expect(
      stageAttachments(actor, await scope(actor, { allowsAttachments: false }), [
        { filename: 'a.png', bytes: PNG },
      ]),
    ).rejects.toThrow(/forum does not accept file attachments/)
    expect(objects.size).toBe(0)
  })

  it('refuses when the board cannot store files at all', async () => {
    installTestContainer({ container: { attachments: null } })
    const actor = actorRef.current!
    await expect(
      stageAttachments(actor, await scope(actor), [{ filename: 'a.png', bytes: PNG }]),
    ).rejects.toThrow(/cannot accept file attachments/)
  })

  it('writes the bytes to the store before any post exists', async () => {
    const actor = actorRef.current!
    const staged = await stageAttachments(actor, await scope(actor), [
      { filename: 'a.png', bytes: PNG },
    ])

    expect(staged).toHaveLength(1)
    expect(objects.size).toBe(1)
    expect(attachments.created).toEqual([])
  })
})

describe('resolving a download', () => {
  async function get(want: 'file' | 'thumb' = 'file') {
    return resolveDownload(actorRef.current!, 5, want)
  }

  it('grants a ready attachment in a forum the viewer may read', async () => {
    expect(await get()).toMatchObject({
      key: 'attachments/a/file',
      contentType: 'image/png',
      filename: 'photo.png',
    })
  })

  it('grants the thumbnail separately', async () => {
    expect(await get('thumb')).toMatchObject({
      key: 'attachments/a/thumb',
      contentType: 'image/jpeg',
    })
  })

  it('refuses a thumbnail that was never made', async () => {
    attachments.found = {
      record: record({ thumbnailKey: null }),
      postVisibility: 'visible',
      threadVisibility: 'visible',
      threadAuthorUserId: null,
    }
    expect(await get('thumb')).toBeNull()
  })

  it('refuses an upload that has not been re-encoded yet', async () => {
    attachments.found = {
      record: record({ status: 'pending', storageKey: null, sourceKey: 'attachments/a/source' }),
      postVisibility: 'visible',
      threadVisibility: 'visible',
      threadAuthorUserId: null,
    }
    expect(await get()).toBeNull()
  })

  it('refuses one whose processing failed', async () => {
    attachments.found = {
      record: record({ status: 'failed', storageKey: null }),
      postVisibility: 'visible',
      threadVisibility: 'visible',
      threadAuthorUserId: null,
    }
    expect(await get()).toBeNull()
  })

  it('refuses on the status alone, even if a key is somehow set', async () => {
    attachments.found = {
      record: record({ status: 'pending', storageKey: 'attachments/a/file' }),
      postVisibility: 'visible',
      threadVisibility: 'visible',
      threadAuthorUserId: null,
    }
    expect(await get()).toBeNull()
  })

  it('refuses a viewer who cannot see the forum it is in', async () => {
    installTestContainer({
      container: { attachments },
      overrides: [
        {
          forumId: SEED_FORUM.announcements,
          groupId: SEED_GROUP.registered,
          overrides: { canView: false, canViewThreads: false },
        },
      ],
    })
    attachments.found = {
      record: record({ forumId: SEED_FORUM.announcements }),
      postVisibility: 'visible',
      threadVisibility: 'visible',
      threadAuthorUserId: null,
    }
    expect(await get()).toBeNull()
  })

  it('refuses a viewer without `attachment.download`', async () => {
    installTestContainer({
      container: { attachments },
      overrides: [
        {
          forumId: PUBLIC_FORUM,
          groupId: SEED_GROUP.registered,
          overrides: { canDownloadAttachments: false },
        },
      ],
    })
    expect(await get()).toBeNull()
  })

  it('refuses an attachment on content nobody may see', async () => {
    attachments.found = {
      record: record(),
      postVisibility: 'deleted',
      threadVisibility: 'visible',
      threadAuthorUserId: null,
    }
    expect(await get()).toBeNull()

    attachments.found = {
      record: record(),
      postVisibility: 'visible',
      threadVisibility: 'unapproved',
      threadAuthorUserId: null,
    }
    expect(await get()).toBeNull()
  })

  it('does not use the unapproved permission for deleted content', async () => {
    installTestContainer({
      container: { attachments },
      overrides: [
        {
          forumId: PUBLIC_FORUM,
          groupId: SEED_GROUP.registered,
          overrides: { canViewUnapproved: true, canViewDeleted: false },
        },
      ],
    })
    attachments.found = {
      record: record(),
      postVisibility: 'deleted',
      threadVisibility: 'visible',
      threadAuthorUserId: null,
    }

    expect(await get()).toBeNull()
  })

  it('grants hidden content to somebody who handles the queue', async () => {
    attachments.found = {
      record: record(),
      postVisibility: 'unapproved',
      threadVisibility: 'visible',
      threadAuthorUserId: null,
    }
    actorRef.current = await actorFor(SEED_GROUP.superModerators, 2)

    expect(await get()).not.toBeNull()
  })

  it('refuses an unknown attachment the same way it refuses a forbidden one', async () => {
    attachments.found = null
    expect(await get()).toBeNull()
  })

  it('refuses when the board has no attachment store', async () => {
    installTestContainer({ container: { attachments: null } })
    expect(await get()).toBeNull()
  })
})
