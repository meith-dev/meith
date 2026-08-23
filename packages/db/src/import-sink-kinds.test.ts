import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { type CopiedAttachment, type CopiedAvatar, PostgresImportSink } from './import-sink'
import { createTestDb, type TestDb } from './pglite.fixture'
import { resultRows } from './result-rows'

const rowsOf = async <T>(query: Parameters<TestDb['db']['execute']>[0]): Promise<T[]> =>
  resultRows<T>(await harness.db.execute(query))

let harness: TestDb
let sink: PostgresImportSink

beforeAll(async () => {
  harness = await createTestDb()
  sink = new PostgresImportSink(harness.db)
}, 60_000)

afterAll(async () => {
  await harness.close()
})

beforeEach(async () => {
  await harness.db.execute(sql`
    truncate posts, threads, forums, legacy_ids, private_messages, private_message_copies,
             attachments, polls, poll_options, poll_votes, reputation, warnings, bans,
             user_relations, thread_subscriptions, forum_subscriptions
    restart identity cascade
  `)
  await harness.db.execute(sql`delete from users where legacy_id is not null`)
})

const user = (uid: number, name = `mybb${uid}`) => ({
  legacyId: uid,
  username: name,
  email: `${name}@old.test`,
  legacyPasswordHash: `mybb$salt${uid}$${'a'.repeat(32)}`,
  registeredAt: new Date('2014-03-02T00:00:00Z'),
  lastVisitAt: null,
  postCount: 0,
  legacyGroupId: 2,
})

const forum = (fid: number) => ({
  legacyId: fid,
  type: 'forum' as const,
  title: `Forum ${fid}`,
  description: null,
  legacyParentId: null,
  displayOrder: fid,
  linkUrl: null,
})

const thread = (tid: number, fid: number, uid: number) => ({
  legacyId: tid,
  legacyForumId: fid,
  title: `Thread ${tid}`,
  legacyAuthorId: uid,
  authorUsername: `mybb${uid}`,
  createdAt: new Date('2015-01-01T00:00:00Z'),
  lastPostAt: new Date('2015-02-01T00:00:00Z'),
  replyCount: 0,
  viewCount: 0,
  isSticky: false,
  isLocked: false,
  visibility: 'visible' as const,
})

const post = (pid: number, tid: number, fid: number, uid: number) => ({
  legacyId: pid,
  legacyThreadId: tid,
  legacyForumId: fid,
  legacyAuthorId: uid,
  authorUsername: `mybb${uid}`,
  body: `Post ${pid}`,
  createdAt: new Date('2015-01-01T00:00:00Z'),
  editedAt: null,
  visibility: 'visible' as const,
})

async function seedTree(): Promise<void> {
  await sink.putUsers([user(1), user(2)])
  await sink.putForums([forum(3)])
  await sink.putThreads([thread(91, 3, 1)])
  await sink.putPosts([post(4102, 91, 3, 1)])
}

const attachment = (aid: number, pid = 4102) => ({
  legacyId: aid,
  legacyPostId: pid,
  legacyUserId: 1,
  filename: 'photo.jpg',
  contentType: 'image/jpeg',
  sizeBytes: 1000,
  path: `post_${aid}.attach`,
  thumbnailPath: null,
  downloadCount: 3,
  createdAt: new Date('2015-01-05T00:00:00Z'),
})

const poll = (pid: number, tid = 91) => ({
  legacyId: pid,
  legacyThreadId: tid,
  question: 'Best?',
  options: [
    { order: 1, label: 'A', voteCount: 1 },
    { order: 2, label: 'B', voteCount: 0 },
  ],
  closesAt: null,
  createdAt: new Date('2015-01-02T00:00:00Z'),
  maxOptions: 1,
  allowRevote: false,
  publicVotes: false,
})

const pm = (pmid: number, from = 1, owner = 2) => ({
  legacyId: pmid,
  legacyAuthorId: from,
  subject: 'Hello',
  body: 'Hi.',
  sentAt: new Date('2015-01-03T00:00:00Z'),
  copies: [{ legacyOwnerId: owner, folder: 'inbox' as const, readAt: null }],
})

describe('avatars', () => {
  const avatar = (uid: number) => ({
    legacyUserId: uid,
    source: 'upload' as const,
    path: `avatars/avatar_${uid}.png`,
    width: 64,
    height: 64,
  })

  it('skips every avatar when no uploads directory was given', async () => {
    await seedTree()
    const result = await sink.putAvatars([avatar(1)])

    expect(result).toMatchObject({ inserted: 0, updated: 0 })
    expect(result.skipped[0]!.reason).toMatch(/--uploads-dir/)
  })

  it('stores a copied avatar against the member', async () => {
    await seedTree()
    const copying = new PostgresImportSink(harness.db, {
      copier: {
        avatar: async (): Promise<CopiedAvatar> => ({
          outcome: 'ready',
          key: 'avatar/aa/bb.png',
          width: 96,
          height: 96,
        }),
        attachment: async (): Promise<CopiedAttachment> => ({
          outcome: 'failed',
          reason: 'unused',
        }),
      },
    })

    const result = await copying.putAvatars([avatar(1)])
    expect(result).toMatchObject({ updated: 1, skipped: [] })

    const rows = await rowsOf<{ avatar_status: string; avatar_key: string; avatar_width: number }>(
      sql`select avatar_status, avatar_key, avatar_width from users where legacy_id = 1`,
    )
    expect(rows[0]).toEqual({
      avatar_status: 'ready',
      avatar_key: 'avatar/aa/bb.png',
      avatar_width: 96,
    })
  })

  it('never migrates a remote avatar', async () => {
    await seedTree()
    const result = await sink.putAvatars([{ ...avatar(1), source: 'remote' as const }])
    expect(result.skipped[0]!.reason).toMatch(/remote avatar/)
  })
})

describe('attachments', () => {
  it('imports the row with the failure recorded when the file cannot be copied', async () => {
    await seedTree()
    const result = await sink.putAttachments([attachment(9)])

    expect(result).toMatchObject({ inserted: 1, updated: 0, skipped: [] })
    const rows = await rowsOf<{ status: string; failure_reason: string; post_id: number }>(
      sql`select status, failure_reason, post_id from attachments where legacy_id = 9`,
    )
    expect(rows[0]!.status).toBe('failed')
    expect(rows[0]!.failure_reason).toMatch(/post_9\.attach/)
  })

  it('stores the file when a copier is available, and upgrades a failed row on re-run', async () => {
    await seedTree()
    await sink.putAttachments([attachment(9)])

    const copying = new PostgresImportSink(harness.db, {
      copier: {
        avatar: async (): Promise<CopiedAvatar> => ({ outcome: 'failed', reason: 'unused' }),
        attachment: async (): Promise<CopiedAttachment> => ({
          outcome: 'ready',
          storageKey: 'import/attachments/9/file.jpg',
          thumbnailKey: null,
          contentType: 'image/jpeg',
          sizeBytes: 990,
          width: 640,
          height: 480,
        }),
      },
    })

    const again = await copying.putAttachments([attachment(9)])
    expect(again).toMatchObject({ inserted: 0, updated: 1 })

    const rows = await rowsOf<{
      status: string
      storage_key: string
      width: number
      failure_reason: string | null
    }>(sql`select status, storage_key, width, failure_reason from attachments where legacy_id = 9`)
    expect(rows[0]).toEqual({
      status: 'ready',
      storage_key: 'import/attachments/9/file.jpg',
      width: 640,
      failure_reason: null,
    })
  })

  it('does not regress a stored file when re-run without the uploads directory', async () => {
    await seedTree()
    const copying = new PostgresImportSink(harness.db, {
      copier: {
        avatar: async (): Promise<CopiedAvatar> => ({ outcome: 'failed', reason: 'unused' }),
        attachment: async (): Promise<CopiedAttachment> => ({
          outcome: 'ready',
          storageKey: 'import/attachments/9/file.jpg',
          thumbnailKey: null,
          contentType: 'image/jpeg',
          sizeBytes: 990,
          width: 640,
          height: 480,
        }),
      },
    })
    await copying.putAttachments([attachment(9)])
    await sink.putAttachments([attachment(9)])

    const rows = await rowsOf<{ status: string; storage_key: string }>(
      sql`select status, storage_key from attachments where legacy_id = 9`,
    )
    expect(rows[0]).toEqual({ status: 'ready', storage_key: 'import/attachments/9/file.jpg' })
  })

  it('skips an attachment whose post never arrived', async () => {
    await seedTree()
    const result = await sink.putAttachments([attachment(9, 999)])
    expect(result.skipped).toEqual([{ legacyId: 9, reason: 'post 999 not imported' }])
  })
})

describe('polls and votes', () => {
  it('creates the poll with its options on the imported thread', async () => {
    await seedTree()
    const result = await sink.putPolls([poll(7)])
    expect(result).toMatchObject({ inserted: 1 })

    const options = await rowsOf<{ label: string; display_order: number; vote_count: number }>(
      sql`select label, display_order, vote_count from poll_options order by display_order`,
    )
    expect(options).toEqual([
      { label: 'A', display_order: 1, vote_count: 1 },
      { label: 'B', display_order: 2, vote_count: 0 },
    ])
  })

  it('imports votes against the right option and ignores duplicates', async () => {
    await seedTree()
    await sink.putPolls([poll(7)])

    const vote = { legacyPollId: 7, legacyUserId: 2, optionOrder: 2, votedAt: null }
    const first = await sink.putPollVotes([vote])
    expect(first).toMatchObject({ inserted: 1, updated: 0 })

    const again = await sink.putPollVotes([vote])
    expect(again).toMatchObject({ inserted: 0, updated: 1 })

    const rows = await rowsOf<{ option_id: number }>(sql`select option_id from poll_votes`)
    expect(rows).toHaveLength(1)
  })

  it('re-runs without duplicating options', async () => {
    await seedTree()
    await sink.putPolls([poll(7)])
    await sink.putPolls([poll(7)])

    const rows = await rowsOf<{ n: number }>(sql`select count(*)::int as n from poll_options`)
    expect(rows[0]!.n).toBe(2)
  })

  it('keeps every option a member picked in a multiple-choice poll', async () => {
    await seedTree()
    await sink.putPolls([{ ...poll(7), maxOptions: 0 }])

    const result = await sink.putPollVotes([
      { legacyPollId: 7, legacyUserId: 2, optionOrder: 1, votedAt: null },
      { legacyPollId: 7, legacyUserId: 2, optionOrder: 2, votedAt: null },
    ])
    expect(result).toMatchObject({ inserted: 2 })

    const rows = await rowsOf<{ option_id: number }>(sql`select option_id from poll_votes`)
    expect(rows).toHaveLength(2)
  })

  it('carries the choice limit, re-voting and public votes onto the poll', async () => {
    await seedTree()
    await sink.putPolls([{ ...poll(7), maxOptions: 2, allowRevote: true, publicVotes: true }])

    const rows = await rowsOf<{
      max_options: number
      allow_revote: boolean
      public_votes: boolean
    }>(sql`select max_options, allow_revote, public_votes from polls`)
    expect(rows[0]).toMatchObject({ max_options: 2, allow_revote: true, public_votes: true })
  })

  it('skips a vote for an option that does not exist', async () => {
    await seedTree()
    await sink.putPolls([poll(7)])
    const result = await sink.putPollVotes([
      { legacyPollId: 7, legacyUserId: 2, optionOrder: 9, votedAt: null },
    ])
    expect(result.skipped[0]!.reason).toMatch(/option 9/)
  })
})

describe('private messages', () => {
  it('writes the message and a copy per resolved owner', async () => {
    await seedTree()
    const result = await sink.putPrivateMessages([pm(11)])
    expect(result).toMatchObject({ inserted: 1, skipped: [] })

    const messages = await rowsOf<{ author_username: string; subject: string }>(
      sql`select author_username, subject from private_messages where legacy_id = 11`,
    )
    expect(messages[0]).toEqual({ author_username: 'mybb1', subject: 'Hello' })

    const copies = await rowsOf<{ folder: string; role: string }>(
      sql`select folder, role from private_message_copies`,
    )
    expect(copies).toEqual([{ folder: 'inbox', role: 'to' }])
  })

  it('marks the sender’s own copy as the author’s', async () => {
    await seedTree()
    await sink.putPrivateMessages([
      { ...pm(12), copies: [{ legacyOwnerId: 1, folder: 'sent' as const, readAt: null }] },
    ])

    const copies = await rowsOf<{ folder: string; role: string }>(
      sql`select folder, role from private_message_copies`,
    )
    expect(copies).toEqual([{ folder: 'sent', role: 'author' }])
  })

  it('re-runs without duplicating copies', async () => {
    await seedTree()
    await sink.putPrivateMessages([pm(11)])
    const again = await sink.putPrivateMessages([pm(11)])
    expect(again).toMatchObject({ inserted: 0, updated: 1 })

    const rows = await rowsOf<{ n: number }>(
      sql`select count(*)::int as n from private_message_copies`,
    )
    expect(rows[0]!.n).toBe(1)
  })

  it('keeps the message even when its author is gone, and reports lost recipients', async () => {
    await seedTree()
    const result = await sink.putPrivateMessages([
      { ...pm(13, 0), copies: [{ legacyOwnerId: 999, folder: 'inbox' as const, readAt: null }] },
    ])

    expect(result.inserted).toBe(1)
    expect(result.skipped[0]!.reason).toMatch(/recipient 999/)
    const rows = await rowsOf<{ author_user_id: number | null }>(
      sql`select author_user_id from private_messages where legacy_id = 13`,
    )
    expect(rows[0]!.author_user_id).toBeNull()
  })
})

describe('subscriptions', () => {
  it('imports thread and forum watches with their mode', async () => {
    await seedTree()

    const threads = await sink.putThreadSubscriptions([
      { legacyId: 1, legacyUserId: 2, legacyTargetId: 91, mode: 'none' },
    ])
    const forums = await sink.putForumSubscriptions([
      { legacyId: 2, legacyUserId: 2, legacyTargetId: 3, mode: 'instant' },
    ])

    expect(threads).toMatchObject({ inserted: 1 })
    expect(forums).toMatchObject({ inserted: 1 })

    const rows = await rowsOf<{ mode: string }>(sql`select mode from thread_subscriptions`)
    expect(rows).toEqual([{ mode: 'none' }])
  })

  it('re-runs as an update, not a duplicate', async () => {
    await seedTree()
    const row = { legacyId: 1, legacyUserId: 2, legacyTargetId: 91, mode: 'instant' as const }
    await sink.putThreadSubscriptions([row])
    const again = await sink.putThreadSubscriptions([row])

    expect(again).toMatchObject({ inserted: 0, updated: 1 })
  })

  it('skips a watch on a thread that never arrived', async () => {
    await seedTree()
    const result = await sink.putThreadSubscriptions([
      { legacyId: 1, legacyUserId: 2, legacyTargetId: 999, mode: 'instant' },
    ])
    expect(result.skipped[0]!.reason).toMatch(/thread 999/)
  })
})

describe('reputation', () => {
  it('imports the entries and recounts the member’s total', async () => {
    await seedTree()
    await sink.putReputation([
      {
        legacyId: 1,
        legacyUserId: 1,
        legacyGivenByUserId: 2,
        legacyPostId: 4102,
        points: 2,
        comment: 'Helpful',
        createdAt: new Date('2015-01-04T00:00:00Z'),
      },
      {
        legacyId: 2,
        legacyUserId: 1,
        legacyGivenByUserId: 0,
        legacyPostId: null,
        points: -1,
        comment: '',
        createdAt: new Date('2015-01-05T00:00:00Z'),
      },
    ])

    const rows = await rowsOf<{ reputation: number }>(
      sql`select reputation from users where legacy_id = 1`,
    )
    expect(rows[0]!.reputation).toBe(1)
  })
})

describe('warnings', () => {
  it('imports live warnings into the member’s points, ignoring revoked and expired ones', async () => {
    await seedTree()
    await sink.putWarnings([
      {
        legacyId: 1,
        legacyUserId: 1,
        legacyIssuedByUserId: 2,
        legacyPostId: null,
        title: 'Spam',
        points: 2,
        notes: '',
        issuedAt: new Date('2015-01-01T00:00:00Z'),
        expiresAt: null,
        revokedAt: null,
        revokeReason: null,
      },
      {
        legacyId: 2,
        legacyUserId: 1,
        legacyIssuedByUserId: 2,
        legacyPostId: null,
        title: 'Old',
        points: 5,
        notes: '',
        issuedAt: new Date('2015-01-01T00:00:00Z'),
        expiresAt: new Date('2015-02-01T00:00:00Z'),
        revokedAt: null,
        revokeReason: null,
      },
      {
        legacyId: 3,
        legacyUserId: 1,
        legacyIssuedByUserId: 2,
        legacyPostId: null,
        title: 'Revoked',
        points: 9,
        notes: '',
        issuedAt: new Date('2015-01-01T00:00:00Z'),
        expiresAt: null,
        revokedAt: new Date('2015-01-02T00:00:00Z'),
        revokeReason: 'Appealed',
      },
    ])

    const rows = await rowsOf<{ warning_points: number }>(
      sql`select warning_points from users where legacy_id = 1`,
    )
    expect(rows[0]!.warning_points).toBe(2)

    const count = await rowsOf<{ n: number }>(sql`select count(*)::int as n from warnings`)
    expect(count[0]!.n).toBe(3)
  })
})

describe('bans', () => {
  const ban = (uid: number, expiresAt: Date | null = null) => ({
    legacyId: uid,
    legacyUserId: uid,
    legacyBannedByUserId: 2,
    reason: 'Spam',
    publicReason: null,
    createdAt: new Date('2015-01-01T00:00:00Z'),
    expiresAt,
  })

  it('moves the member into the banned group and remembers where they were', async () => {
    await seedTree()
    const result = await sink.putBans([ban(1)])
    expect(result).toMatchObject({ inserted: 1 })

    const rows = await rowsOf<{ key: string; previous: number | null }>(sql`
      select g.key, b.previous_primary_group_id as previous
        from users u
        join usergroups g on g.id = u.primary_group_id
        join bans b on b.user_id = u.id
       where u.legacy_id = 1
    `)
    expect(rows[0]!.key).toBe('banned')
    expect(rows[0]!.previous).not.toBeNull()
  })

  it('re-runs without stacking bans or forgetting the original group', async () => {
    await seedTree()
    await sink.putBans([ban(1)])
    const again = await sink.putBans([ban(1)])
    expect(again).toMatchObject({ inserted: 0, updated: 1 })

    const rows = await rowsOf<{ n: number; previous: number | null }>(sql`
      select count(*)::int as n, min(previous_primary_group_id) as previous from bans
    `)
    expect(rows[0]!.n).toBe(1)

    const groups = await rowsOf<{ key: string }>(sql`
      select g.key from usergroups g where g.id = ${rows[0]!.previous}
    `)
    expect(groups[0]!.key).toBe('registered')
  })

  it('skips a second active ban for the same member', async () => {
    await seedTree()
    await sink.putBans([ban(1)])
    const result = await sink.putBans([{ ...ban(1), legacyId: 77 }])
    expect(result.skipped[0]!.reason).toMatch(/active ban/)
  })
})

describe('buddy and ignore lists', () => {
  it('imports both directions independently and re-runs cleanly', async () => {
    await seedTree()
    const rows = [
      { legacyUserId: 1, legacyOtherUserId: 2, kind: 'buddy' as const },
      { legacyUserId: 2, legacyOtherUserId: 1, kind: 'ignore' as const },
    ]
    const first = await sink.putUserRelations(rows)
    expect(first).toMatchObject({ inserted: 2, updated: 0 })

    const again = await sink.putUserRelations(rows)
    expect(again).toMatchObject({ inserted: 0, updated: 2 })

    const stored = await rowsOf<{ kind: string }>(
      sql`select kind from user_relations order by kind`,
    )
    expect(stored).toEqual([{ kind: 'buddy' }, { kind: 'ignore' }])
  })

  it('skips a relation to a member who never arrived', async () => {
    await seedTree()
    const result = await sink.putUserRelations([
      { legacyUserId: 1, legacyOtherUserId: 999, kind: 'buddy' },
    ])
    expect(result.skipped[0]!.reason).toMatch(/999/)
  })
})

describe('the phpBB password prefix', () => {
  it('stores the algorithm the hash names', async () => {
    await sink.putUsers([{ ...user(8), legacyPasswordHash: 'phpbb$$2y$10$abc' }])

    const rows = await rowsOf<{ password_algo: string; password_hash: string }>(
      sql`select password_algo, password_hash from users where legacy_id = 8`,
    )
    expect(rows[0]).toEqual({ password_algo: 'phpbb', password_hash: 'phpbb$$2y$10$abc' })
  })
})
