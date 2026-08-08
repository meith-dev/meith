/**
 * F42 at the app layer.
 *
 * The domain rules are unit-tested in `@meith/attachments` and the SQL against
 * real Postgres. What is proven here is the part only the app can get wrong:
 * **the permission questions, and the order they are asked in.**
 *
 * A download route is the one place on this board where an attacker supplies a
 * small integer and gets bytes back, so every one of these is about refusing:
 * the wrong community, the wrong status, content nobody may see, and the difference
 * between "no such attachment" and "not for you" — which must not be visible
 * from outside.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { InMemoryAuthorizationSource, combinePermissionSets } from '@meith/authorization'
import type { Actor } from '@meith/authorization'
import type { AttachmentForDownload, AttachmentRecord } from '@meith/attachments'

const actorRef: { current: Actor | null } = { current: null }
vi.mock('./context', () => ({ getActor: async () => actorRef.current }))

/** The file store and queue the app module reaches for through `drivers()`. */
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

/* The codecs are never exercised here — this file is about permissions, and
   loading 630 KB of WebAssembly to prove a refusal would be absurd. */
vi.mock('@meith/drivers/images', () => ({
  imageProcessor: {
    async process() {
      throw new Error('not used in this suite')
    },
  },
}))

const {
  attachmentLimits,
  canAttach,
  resolveDownload,
  stageAttachments,
  submittedFiles,
} = await import('./attachments')
const { SEED_BOARD, SEED_GROUP, SEED_COMMUNITY } = await import('./seed-board')
const { installTestContainer } = await import('./test-container')

const ADA = 1
const PUBLIC_COMMUNITY = SEED_COMMUNITY.general

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
    communityId: PUBLIC_COMMUNITY,
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

/** The installed container's Authorizer, so a scope is resolved for real. */
async function scope(actor: Actor, communityId = PUBLIC_COMMUNITY) {
  const installed = (
    globalThis as Record<
      symbol,
      { authorizer: { communityMatrix(a: Actor, id: number): Promise<unknown> } }
    >
  )[Symbol.for('@meith/community.container')]!

  return {
    communityId,
    community: (await installed.authorizer.communityMatrix(actor, communityId)) as never,
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
    /*
     * Fixture mode (D38). Absent rather than disabled: a control that produces
     * an error every time it is used is worse than no control.
     */
    installTestContainer({ container: { attachments: null } })
    const actor = actorRef.current!
    expect(canAttach(actor, await scope(actor))).toBe(false)
  })

  it('is absent for a guest', async () => {
    const guest = await actorFor(SEED_GROUP.guest, null)
    expect(canAttach(guest, await scope(guest))).toBe(false)
  })
})

describe('the limits shown on the form', () => {
  it('are the resolved community matrix, with 0 left as 0 for the domain to read', async () => {
    /*
     * 0 means unlimited (R4.2) and this is deliberately *not* the place that
     * interprets it — `maxBytesFor` and `maxPerPostFor` are, and there is
     * exactly one of each.
     */
    const actor = actorRef.current!
    expect(attachmentLimits(await scope(actor))).toEqual({
      maxPerPost: 0,
      maxSizeKb: 0,
    })
  })
})

describe('submittedFiles', () => {
  it('ignores an untouched file input', async () => {
    /*
     * A `<input type="file">` nobody chose a file for still submits — as an
     * entry with an empty name and no bytes. Treating that as an upload would
     * make every post from a browser that renders the control fail.
     */
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
    /*
     * A member with no upload right may still post. Kills the mutant that
     * checks the permission before checking whether anything was submitted.
     */
    const guest = await actorFor(SEED_GROUP.guest, null)
    expect(await stageAttachments(guest, await scope(guest), [])).toEqual([])
    expect(objects.size).toBe(0)
  })

  it('refuses a member without `attachment.upload` in this community', async () => {
    const guest = await actorFor(SEED_GROUP.guest, null)
    await expect(
      stageAttachments(guest, await scope(guest), [{ filename: 'a.png', bytes: PNG }]),
    ).rejects.toThrow(/may not attach/)
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

  it('grants a ready attachment in a community the viewer may read', async () => {
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
    }
    expect(await get('thumb')).toBeNull()
  })

  it('refuses an upload that has not been re-encoded yet', async () => {
    /*
     * The claim the whole feature rests on: what a member uploaded is never
     * served. Kills the mutant that drops the status check, which would hand
     * out the quarantined original.
     */
    attachments.found = {
      record: record({ status: 'pending', storageKey: null, sourceKey: 'attachments/a/source' }),
      postVisibility: 'visible',
      threadVisibility: 'visible',
    }
    expect(await get()).toBeNull()
  })

  it('refuses one whose processing failed', async () => {
    attachments.found = {
      record: record({ status: 'failed', storageKey: null }),
      postVisibility: 'visible',
      threadVisibility: 'visible',
    }
    expect(await get()).toBeNull()
  })

  it('refuses on the status alone, even if a key is somehow set', async () => {
    /*
     * `pending` and `ready` differ by *two* things — the status and which key
     * is populated — and the database keeps them in step: `markReady` swaps
     * both in one statement. This asserts the status is sufficient on its own,
     * which is what makes that a guarantee rather than a coincidence. Without
     * it the status check is shadowed by the key check and can be deleted with
     * every other test still passing, which is exactly what happened.
     */
    attachments.found = {
      record: record({ status: 'pending', storageKey: 'attachments/a/file' }),
      postVisibility: 'visible',
      threadVisibility: 'visible',
    }
    expect(await get()).toBeNull()
  })

  it('refuses a viewer who cannot see the community it is in', async () => {
    /*
     * The attachment id is a small integer anybody can enumerate, so this is
     * the check that stops a private community's images being readable by URL.
     * Kills the mutant that drops `thread.view` and keeps only the download
     * permission — which every ordinary member holds.
     */
    installTestContainer({
      container: { attachments },
      overrides: [
        {
          communityId: SEED_COMMUNITY.announcements,
          groupId: SEED_GROUP.registered,
          overrides: { canView: false, canViewThreads: false },
        },
      ],
    })
    attachments.found = {
      record: record({ communityId: SEED_COMMUNITY.announcements }),
      postVisibility: 'visible',
      threadVisibility: 'visible',
    }
    expect(await get()).toBeNull()
  })

  it('refuses a viewer without `attachment.download`', async () => {
    /*
     * A distinct permission from viewing the thread: a board may let everybody
     * read and only members fetch the files. Kills the mutant that treats
     * `thread.view` as sufficient.
     */
    installTestContainer({
      container: { attachments },
      overrides: [
        {
          communityId: PUBLIC_COMMUNITY,
          groupId: SEED_GROUP.registered,
          overrides: { canDownloadAttachments: false },
        },
      ],
    })
    expect(await get()).toBeNull()
  })

  it('refuses an attachment on content nobody may see', async () => {
    /*
     * A direct URL never goes through the postbit, which is exactly how this
     * check gets missed. Kills the mutant that drops the visibility test.
     */
    attachments.found = {
      record: record(),
      postVisibility: 'deleted',
      threadVisibility: 'visible',
    }
    expect(await get()).toBeNull()

    attachments.found = {
      record: record(),
      postVisibility: 'visible',
      threadVisibility: 'unapproved',
    }
    expect(await get()).toBeNull()
  })

  it('grants hidden content to somebody who handles the queue', async () => {
    attachments.found = {
      record: record(),
      postVisibility: 'unapproved',
      threadVisibility: 'visible',
    }
    actorRef.current = await actorFor(SEED_GROUP.superModerators, 2)

    expect(await get()).not.toBeNull()
  })

  it('refuses an unknown attachment the same way it refuses a forbidden one', async () => {
    /*
     * Both null, with no reason. Distinguishing them would turn this into an
     * oracle for what exists in communities the caller cannot see.
     */
    attachments.found = null
    expect(await get()).toBeNull()
  })

  it('refuses when the board has no attachment store', async () => {
    installTestContainer({ container: { attachments: null } })
    expect(await get()).toBeNull()
  })
})
