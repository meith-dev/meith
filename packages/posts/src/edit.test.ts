import { describe, expect, it } from 'vitest'

import { ValidationError } from '@meith/core'

import {
  type EditCapabilities,
  editedNote,
  PostEditor,
  type PostEditRecord,
  type PostEditTarget,
  type PostVisibilityRecord,
  type PostWriteRepository,
} from './edit'

const NOW = new Date('2026-07-30T12:00:00Z')

class RecordingPosts implements PostWriteRepository {
  readonly edits: PostEditRecord[] = []
  readonly moves: PostVisibilityRecord[] = []
  constructor(private readonly applied = true) {}

  async findEditTarget(): Promise<PostEditTarget | null> {
    return null
  }

  async applyEdit(record: PostEditRecord): Promise<void> {
    this.edits.push(record)
  }

  async applyVisibility(record: PostVisibilityRecord): Promise<boolean> {
    this.moves.push(record)
    return this.applied
  }
}

const CAPABILITIES: EditCapabilities = {
  isOwn: true,
  editWindowMinutes: 0,
  bypassesWindow: false,
  bypassesLock: false,
  requiresApprovalOnEdit: false,
  bypassesModeration: false,
}

function target(
  overrides: {
    post?: Partial<PostEditTarget['post']>
    thread?: Partial<PostEditTarget['thread']>
    forum?: Partial<PostEditTarget['forum']>
  } = {},
): PostEditTarget {
  return {
    post: {
      id: 50,
      threadId: 20,
      forumId: 4,
      authorUserId: 7,
      subject: null,
      message: 'the original body',
      visibility: 'visible',
      isFirstPost: false,
      revisionCount: 0,
      createdAt: new Date('2026-07-30T11:00:00Z'),
      ...overrides.post,
    },
    thread: {
      id: 20,
      slug: 'hello',
      title: 'Hello',
      isLocked: false,
      visibility: 'visible',
      ...overrides.thread,
    },
    forum: { id: 4, slug: 'general', isOpen: true, ...overrides.forum },
  }
}

function editor(posts: PostWriteRepository, maxLength = 100, editGraceSeconds = 0): PostEditor {
  return new PostEditor({
    posts,
    config: { maxLength, editGraceSeconds },
    now: () => NOW,
  })
}

describe('PostEditor.edit', () => {
  it('stores the previous body as the next revision', async () => {
    const posts = new RecordingPosts()
    const result = await editor(posts).edit(
      { message: 'a better body', reason: 'typo', capabilities: CAPABILITIES },
      7,
      target({ post: { revisionCount: 2 } }),
    )

    expect(result).toMatchObject({ postId: 50, changed: true, heldForApproval: false })
    expect(posts.edits[0]).toMatchObject({
      message: 'a better body',
      previousMessage: 'the original body',
      revision: 3,
      reason: 'typo',
      editedByUserId: 7,
      editedAt: NOW,
    })
  })

  it('records no reason when none was given', async () => {
    const posts = new RecordingPosts()
    await editor(posts).edit(
      { message: 'changed', reason: '   ', capabilities: CAPABILITIES },
      7,
      target(),
    )
    expect(posts.edits[0]!.reason).toBeNull()
  })

  it('writes nothing when the body is unchanged', async () => {
    const posts = new RecordingPosts()
    const result = await editor(posts).edit(
      { message: '  the original body  ', reason: '', capabilities: CAPABILITIES },
      7,
      target(),
    )

    expect(result.changed).toBe(false)
    expect(posts.edits).toHaveLength(0)
  })

  describe('the edit window', () => {
    const late = { ...CAPABILITIES, editWindowMinutes: 30 }

    it('refuses an own edit past the limit', async () => {
      const posts = new RecordingPosts()
      await expect(
        editor(posts).edit({ message: 'late', reason: '', capabilities: late }, 7, target()),
      ).rejects.toThrow(ValidationError)
      expect(posts.edits).toHaveLength(0)
    })

    it('allows it inside the limit', async () => {
      const posts = new RecordingPosts()
      await editor(posts).edit(
        { message: 'in time', reason: '', capabilities: { ...late, editWindowMinutes: 90 } },
        7,
        target(),
      )
      expect(posts.edits).toHaveLength(1)
    })

    it('treats zero as unlimited', async () => {
      const posts = new RecordingPosts()
      await editor(posts).edit(
        { message: 'much later', reason: '', capabilities: { ...late, editWindowMinutes: 0 } },
        7,
        target({ post: { createdAt: new Date('2020-01-01T00:00:00Z') } }),
      )
      expect(posts.edits).toHaveLength(1)
    })

    it('does not apply to someone editing another member"s post', async () => {
      const posts = new RecordingPosts()
      await editor(posts).edit(
        { message: 'fixed', reason: '', capabilities: { ...late, isOwn: false } },
        99,
        target({ post: { createdAt: new Date('2020-01-01T00:00:00Z') } }),
      )
      await editor(posts).edit(
        { message: 'fixed again', reason: '', capabilities: { ...late, bypassesWindow: true } },
        99,
        target({ post: { createdAt: new Date('2020-01-01T00:00:00Z') } }),
      )
      expect(posts.edits).toHaveLength(2)
    })
  })

  describe('what refuses an edit outright', () => {
    it.each([
      ['a deleted post', target({ post: { visibility: 'deleted' } })],
      ['a thread that is not visible', target({ thread: { visibility: 'unapproved' } })],
      ['a locked thread', target({ thread: { isLocked: true } })],
      ['a closed forum', target({ forum: { isOpen: false } })],
    ])('refuses %s', async (_label, blocked) => {
      const posts = new RecordingPosts()
      await expect(
        editor(posts).edit({ message: 'new', reason: '', capabilities: CAPABILITIES }, 7, blocked),
      ).rejects.toThrow(ValidationError)
      expect(posts.edits).toHaveLength(0)
    })

    it('lets a moderator edit in a locked thread and a closed forum', async () => {
      const posts = new RecordingPosts()
      const bypass = { ...CAPABILITIES, bypassesLock: true }
      await editor(posts).edit(
        { message: 'new', reason: '', capabilities: bypass },
        7,
        target({ thread: { isLocked: true }, forum: { isOpen: false } }),
      )
      expect(posts.edits).toHaveLength(1)
    })

    it('refuses an empty or over-long body', async () => {
      const posts = new RecordingPosts()
      for (const message of ['   ', 'x'.repeat(101)]) {
        await expect(
          editor(posts).edit({ message, reason: '', capabilities: CAPABILITIES }, 7, target()),
        ).rejects.toThrow(ValidationError)
      }
    })
  })

  describe('re-approval on edit', () => {
    const holds = { ...CAPABILITIES, requiresApprovalOnEdit: true }

    it('sends an edited visible post back to the queue', async () => {
      const posts = new RecordingPosts()
      const result = await editor(posts).edit(
        { message: 'changed', reason: '', capabilities: holds },
        7,
        target(),
      )

      expect(result.heldForApproval).toBe(true)
      expect(posts.edits[0]).toMatchObject({
        fromVisibility: 'visible',
        toVisibility: 'unapproved',
      })
    })

    it('does not hold the post when the actor bypasses moderation', async () => {
      const posts = new RecordingPosts()
      const result = await editor(posts).edit(
        { message: 'changed', reason: '', capabilities: { ...holds, bypassesModeration: true } },
        7,
        target(),
      )
      expect(result.heldForApproval).toBe(false)
      expect(posts.edits[0]!.toVisibility).toBe('visible')
    })

    it('leaves an already-unapproved post where it is', async () => {
      const posts = new RecordingPosts()
      const result = await editor(posts).edit(
        { message: 'changed', reason: '', capabilities: holds },
        7,
        target({ post: { visibility: 'unapproved' } }),
      )
      expect(result.heldForApproval).toBe(false)
      expect(posts.edits[0]).toMatchObject({
        fromVisibility: 'unapproved',
        toVisibility: 'unapproved',
      })
    })
  })
})

describe('PostEditor.softDelete', () => {
  it('moves a visible post to deleted', async () => {
    const posts = new RecordingPosts()
    const result = await editor(posts).softDelete(7, target(), { bypassesLock: false })

    expect(result).toMatchObject({ postId: 50, to: 'deleted', changed: true })
    expect(posts.moves[0]).toMatchObject({ from: 'visible', to: 'deleted', actedByUserId: 7 })
  })

  it('refuses the opening post and says what to do instead', async () => {
    const posts = new RecordingPosts()
    await expect(
      editor(posts).softDelete(7, target({ post: { isFirstPost: true } }), {
        bypassesLock: false,
      }),
    ).rejects.toThrow(/first post .* cannot be deleted/i)
    expect(posts.moves).toHaveLength(0)
  })

  it('refuses a post that is already deleted', async () => {
    const posts = new RecordingPosts()
    await expect(
      editor(posts).softDelete(7, target({ post: { visibility: 'deleted' } }), {
        bypassesLock: false,
      }),
    ).rejects.toThrow(ValidationError)
  })

  it('refuses in a locked thread unless the actor bypasses the lock', async () => {
    const posts = new RecordingPosts()
    const locked = target({ thread: { isLocked: true } })

    await expect(editor(posts).softDelete(7, locked, { bypassesLock: false })).rejects.toThrow(
      ValidationError,
    )

    await editor(posts).softDelete(7, locked, { bypassesLock: true })
    expect(posts.moves).toHaveLength(1)
  })

  it('reports an unapplied move rather than throwing', async () => {
    const posts = new RecordingPosts(false)
    const result = await editor(posts).softDelete(7, target(), { bypassesLock: false })
    expect(result.changed).toBe(false)
  })

  it('takes an unapproved post down too', async () => {
    const posts = new RecordingPosts()
    await editor(posts).softDelete(7, target({ post: { visibility: 'unapproved' } }), {
      bypassesLock: false,
    })
    expect(posts.moves[0]).toMatchObject({ from: 'unapproved', to: 'deleted' })
  })
})

describe('PostEditor.restore', () => {
  it('puts a deleted post back', async () => {
    const posts = new RecordingPosts()
    const result = await editor(posts).restore(9, target({ post: { visibility: 'deleted' } }))

    expect(result).toMatchObject({ to: 'visible', changed: true })
    expect(posts.moves[0]).toMatchObject({ from: 'deleted', to: 'visible', actedByUserId: 9 })
  })

  it('refuses a post that is not deleted', async () => {
    const posts = new RecordingPosts()
    await expect(editor(posts).restore(9, target())).rejects.toThrow(ValidationError)
    expect(posts.moves).toHaveLength(0)
  })
})

describe('the silent edit window', () => {
  const OWN: EditCapabilities = { ...CAPABILITIES, isOwn: true }
  const MODERATOR: EditCapabilities = { ...CAPABILITIES, isOwn: false, bypassesWindow: true }

  const change = async (
    capabilities: EditCapabilities,
    graceSeconds: number,
    createdAt: Date,
  ): Promise<PostEditRecord> => {
    const posts = new RecordingPosts()
    await editor(posts, 100, graceSeconds).edit(
      { message: 'a better body', reason: 'typo', capabilities },
      7,
      target({ post: { createdAt } }),
    )
    return posts.edits[0]!
  }

  const MINUTE_OLD = new Date(NOW.getTime() - 60_000)
  const HOUR_OLD = new Date(NOW.getTime() - 3_600_000)

  it('leaves no notice when the author edits inside the window', async () => {
    expect((await change(OWN, 300, MINUTE_OLD)).silent).toBe(true)
  })

  it('leaves the notice on an edit made after the window', async () => {
    expect((await change(OWN, 300, HOUR_OLD)).silent).toBe(false)
  })

  it('counts the boundary second as inside', async () => {
    const exactly = new Date(NOW.getTime() - 300_000)
    expect((await change(OWN, 300, exactly)).silent).toBe(true)
    expect((await change(OWN, 300, new Date(exactly.getTime() - 1000))).silent).toBe(false)
  })

  it('always shows the notice when the window is zero', async () => {
    expect((await change(OWN, 0, MINUTE_OLD)).silent).toBe(false)
  })

  it('never hides a moderator editing somebody else"s post', async () => {
    expect((await change(MODERATOR, 300, MINUTE_OLD)).silent).toBe(false)
    expect((await change(MODERATOR, 86_400, NOW)).silent).toBe(false)
  })

  it('records the revision either way, so the audit trail is whole', async () => {
    const silent = await change(OWN, 300, MINUTE_OLD)
    const noticed = await change(OWN, 300, HOUR_OLD)

    for (const record of [silent, noticed]) {
      expect(record).toMatchObject({
        previousMessage: 'the original body',
        revision: 1,
        reason: 'typo',
        editedByUserId: 7,
        editedAt: NOW,
      })
    }
  })
})

describe('editedNote', () => {
  const at = new Date('2026-07-30T12:00:00Z')
  const format = (): string => '30 July 2026'

  it('is absent for a post nobody has edited', () => {
    expect(editedNote({ editedAt: null, editedByUsername: 'ada', reason: null }, format)).toBeNull()
  })

  it('names the editor and the time', () => {
    expect(editedNote({ editedAt: at, editedByUsername: 'ada', reason: null }, format)).toBe(
      'Last edited by ada on 30 July 2026.',
    )
  })

  it('includes the reason when one was given', () => {
    expect(editedNote({ editedAt: at, editedByUsername: 'ada', reason: 'typo' }, format)).toBe(
      'Last edited by ada on 30 July 2026: typo',
    )
  })

  it('survives the editor"s account being deleted', () => {
    expect(editedNote({ editedAt: at, editedByUsername: null, reason: null }, format)).toBe(
      'Last edited by a deleted account on 30 July 2026.',
    )
  })
})
