import { describe, expect, it } from 'vitest'

import {
  FixtureMybbSource,
  type ImportedPrivateMessage,
  type ImportedSubscription,
  type ImportedUserRelation,
  mapAttachment,
  mapAvatar,
  mapBan,
  mapPoll,
  mapPollVote,
  mapPrivateMessage,
  mapRelationList,
  mapThreadSubscription,
  mapWarning,
  runImport,
} from './index'
import { MemorySink } from './memory-sink.fixture'
import type { MybbTables } from './mybb-rows'

const NOW = 1_600_000_000

describe('avatars', () => {
  const row = (overrides = {}) => ({
    uid: 5,
    avatar: './uploads/avatars/avatar_5.jpg?dateline=123',
    avatartype: 'upload',
    avatardimensions: '96|64',
    ...overrides,
  })

  it('strips the cache-busting query and the leading ./', () => {
    expect(mapAvatar(row())?.path).toBe('uploads/avatars/avatar_5.jpg')
  })

  it('reads the dimensions MyBB stores as width|height', () => {
    expect(mapAvatar(row())).toMatchObject({ width: 96, height: 64 })
  })

  it('reads corrupt dimensions as unknown', () => {
    expect(mapAvatar(row({ avatardimensions: '' }))).toMatchObject({ width: null, height: null })
  })

  it.each(['upload', 'gallery', 'remote'])('keeps the %s source', (avatartype) => {
    expect(mapAvatar(row({ avatartype }))?.source).toBe(avatartype)
  })

  it('drops an unknown avatar type', () => {
    expect(mapAvatar(row({ avatartype: '0' }))).toBeNull()
  })
})

describe('attachments', () => {
  const row = {
    aid: 9,
    pid: 3,
    uid: 5,
    filename: 'photo.jpg',
    filetype: 'image/jpeg',
    filesize: 1234,
    attachname: 'post_5_1600000000.attach',
    thumbnail: 'post_5_1600000000.attach.thumb',
    downloads: 7,
    dateuploaded: NOW,
  }

  it('keeps the legacy path and thumbnail for the copy step', () => {
    expect(mapAttachment(row)).toMatchObject({
      path: 'post_5_1600000000.attach',
      thumbnailPath: 'post_5_1600000000.attach.thumb',
    })
  })

  it('reads SMALL as no separate thumbnail', () => {
    expect(mapAttachment({ ...row, thumbnail: 'SMALL' }).thumbnailPath).toBeNull()
  })
})

describe('polls', () => {
  const row = {
    pid: 2,
    tid: 40,
    question: 'Best colour?',
    dateline: NOW,
    options: 'Red||~|~||Green||~|~||Blue',
    votes: '3||~|~||1||~|~||0',
    timeout: 0,
    multiple: 0,
    public: 0,
  }

  it('splits options on the MyBB separator, in order', () => {
    expect(mapPoll(row)?.options).toEqual([
      { order: 1, label: 'Red', voteCount: 3 },
      { order: 2, label: 'Green', voteCount: 1 },
      { order: 3, label: 'Blue', voteCount: 0 },
    ])
  })

  it('reads timeout days into a closing date', () => {
    const poll = mapPoll({ ...row, timeout: 2 })
    expect(poll?.closesAt?.getTime()).toBe((NOW + 2 * 24 * 60 * 60) * 1000)
    expect(mapPoll(row)?.closesAt).toBeNull()
  })

  it('drops a poll with no usable options', () => {
    expect(mapPoll({ ...row, options: ' ' })).toBeNull()
  })

  it('reads a single-choice poll as one choice with private votes', () => {
    expect(mapPoll(row)).toMatchObject({
      maxOptions: 1,
      allowRevote: false,
      publicVotes: false,
    })
  })

  it('reads a multiple-choice poll as unlimited, and a public one as public', () => {
    expect(mapPoll({ ...row, multiple: 1, public: 1 })).toMatchObject({
      maxOptions: 0,
      publicVotes: true,
    })
  })

  it('keeps a vote pointing at its option by position', () => {
    expect(mapPollVote({ vid: 1, pid: 2, uid: 5, voteoption: 2, dateline: NOW })).toMatchObject({
      legacyPollId: 2,
      optionOrder: 2,
    })
  })

  it('drops a corrupt vote', () => {
    expect(mapPollVote({ vid: 1, pid: 2, uid: 5, voteoption: 0, dateline: NOW })).toBeNull()
  })
})

describe('private messages', () => {
  const row = (overrides = {}) => ({
    pmid: 11,
    uid: 5,
    fromid: 2,
    subject: 'Hello',
    message: 'Hi there.',
    dateline: NOW,
    folder: 1,
    status: 1,
    readtime: NOW + 60,
    ...overrides,
  })

  it('imports each MyBB copy as one message with one owner copy', () => {
    const pm = mapPrivateMessage(row())
    expect(pm).toMatchObject({ legacyId: 11, legacyAuthorId: 2 })
    expect(pm?.copies).toEqual([
      { legacyOwnerId: 5, folder: 'inbox', readAt: new Date((NOW + 60) * 1000) },
    ])
  })

  it('maps the four stock folders', () => {
    expect(mapPrivateMessage(row({ folder: 2 }))?.copies[0]?.folder).toBe('sent')
    expect(mapPrivateMessage(row({ folder: 4 }))?.copies[0]?.folder).toBe('trash')
    expect(mapPrivateMessage(row({ folder: 9 }))?.copies[0]?.folder).toBe('inbox')
  })

  it('skips a draft — it was never sent', () => {
    expect(mapPrivateMessage(row({ folder: 3 }))).toBeNull()
  })

  it('reads an unread message as unread', () => {
    expect(mapPrivateMessage(row({ status: 0 }))?.copies[0]?.readAt).toBeNull()
  })
})

describe('subscriptions', () => {
  it('reads a no-notification watch as none', () => {
    expect(mapThreadSubscription({ sid: 1, uid: 5, tid: 3, notification: 0 }).mode).toBe('none')
    expect(mapThreadSubscription({ sid: 1, uid: 5, tid: 3, notification: 1 }).mode).toBe('instant')
  })
})

describe('warnings', () => {
  const row = {
    wid: 4,
    uid: 5,
    pid: 0,
    title: 'Spam',
    points: 2,
    dateline: NOW,
    issuedby: 1,
    expires: NOW + 86_400,
    daterevoked: 0,
    revokereason: '',
    notes: 'First offence.',
  }

  it('keeps points, expiry and notes', () => {
    expect(mapWarning(row)).toMatchObject({
      points: 2,
      notes: 'First offence.',
      expiresAt: new Date((NOW + 86_400) * 1000),
      revokedAt: null,
    })
  })

  it('reads a revoked warning', () => {
    expect(mapWarning({ ...row, daterevoked: NOW, revokereason: 'Appealed' })).toMatchObject({
      revokedAt: new Date(NOW * 1000),
      revokeReason: 'Appealed',
    })
  })
})

describe('bans', () => {
  it('reads a permanent ban as never expiring', () => {
    expect(mapBan({ uid: 5, admin: 1, dateline: NOW, lifted: 0, reason: 'Spam' })).toMatchObject({
      legacyUserId: 5,
      expiresAt: null,
    })
  })

  it('reads the lifted timestamp as the expiry', () => {
    expect(
      mapBan({ uid: 5, admin: 1, dateline: NOW, lifted: NOW + 60, reason: '' }).expiresAt,
    ).toEqual(new Date((NOW + 60) * 1000))
  })
})

describe('buddy and ignore lists', () => {
  it('expands both comma-separated lists', () => {
    expect(mapRelationList({ uid: 5, buddylist: '1,2', ignorelist: '3' })).toEqual([
      { legacyUserId: 5, legacyOtherUserId: 1, kind: 'buddy' },
      { legacyUserId: 5, legacyOtherUserId: 2, kind: 'buddy' },
      { legacyUserId: 5, legacyOtherUserId: 3, kind: 'ignore' },
    ])
  })

  it('lets buddy win when a user appears in both lists', () => {
    expect(mapRelationList({ uid: 5, buddylist: '2', ignorelist: '2' })).toEqual([
      { legacyUserId: 5, legacyOtherUserId: 2, kind: 'buddy' },
    ])
  })

  it('drops self-references and garbage', () => {
    expect(mapRelationList({ uid: 5, buddylist: '5,abc,-1,0', ignorelist: '' })).toEqual([])
  })
})

const BOARD: MybbTables = {
  users: [
    {
      uid: 1,
      username: 'one',
      email: 'one@example.test',
      password: 'a'.repeat(32),
      salt: 'salt',
      usergroup: 2,
      regdate: NOW,
      lastvisit: NOW,
      postnum: 1,
    },
  ],
  avatars: [
    {
      uid: 1,
      avatar: './uploads/avatars/avatar_1.png',
      avatartype: 'upload',
      avatardimensions: '64|64',
    },
  ],
  attachments: [
    {
      aid: 1,
      pid: 1,
      uid: 1,
      filename: 'a.png',
      filetype: 'image/png',
      filesize: 10,
      attachname: 'a.attach',
      thumbnail: '',
      downloads: 0,
      dateuploaded: NOW,
    },
  ],
  polls: [
    {
      pid: 1,
      tid: 1,
      question: 'Q',
      dateline: NOW,
      options: 'A||~|~||B',
      votes: '1||~|~||0',
      timeout: 0,
      multiple: 0,
      public: 0,
    },
  ],
  pollVotes: [{ vid: 1, pid: 1, uid: 1, voteoption: 1, dateline: NOW }],
  privateMessages: [
    {
      pmid: 1,
      uid: 1,
      fromid: 1,
      subject: 'S',
      message: 'M',
      dateline: NOW,
      folder: 2,
      status: 1,
      readtime: NOW,
    },
  ],
  threadSubscriptions: [{ sid: 1, uid: 1, tid: 1, notification: 1 }],
  forumSubscriptions: [
    { fid: 1, uid: 1 },
    { fid: 2, uid: 1 },
    { fid: 1, uid: 2 },
    { fid: 3, uid: 3 },
  ],
  reputation: [{ rid: 1, uid: 1, adduid: 2, pid: 0, reputation: 1, dateline: NOW, comments: '' }],
  warnings: [
    {
      wid: 1,
      uid: 1,
      pid: 0,
      title: 'W',
      points: 1,
      dateline: NOW,
      issuedby: 2,
      expires: 0,
      daterevoked: 0,
      revokereason: '',
      notes: '',
    },
  ],
  bans: [{ uid: 1, admin: 2, dateline: NOW, lifted: 0, reason: '' }],
  relationLists: [{ uid: 1, buddylist: '2,3', ignorelist: '4' }],
}

describe('the extended fixture round trip', () => {
  it('imports every kind', async () => {
    const sink = new MemorySink()
    const report = await runImport({ source: new FixtureMybbSource(BOARD), sink })

    expect(report.finished).toBe(true)
    expect(sink.count('avatars')).toBe(1)
    expect(sink.count('attachments')).toBe(1)
    expect(sink.count('polls')).toBe(1)
    expect(sink.count('pollVotes')).toBe(1)
    expect(sink.count('privateMessages')).toBe(1)
    expect(sink.count('threadSubscriptions')).toBe(1)
    expect(sink.count('forumSubscriptions')).toBe(4)
    expect(sink.count('reputation')).toBe(1)
    expect(sink.count('warnings')).toBe(1)
    expect(sink.count('bans')).toBe(1)
    expect(sink.count('userRelations')).toBe(3)
  })

  it('never splits one member’s forum subscriptions across pages', async () => {
    const sink = new MemorySink()
    const report = await runImport({
      source: new FixtureMybbSource(BOARD),
      sink,
      pageSize: 1,
    })

    expect(report.finished).toBe(true)
    expect(sink.count('forumSubscriptions')).toBe(4)
    const rows = sink.rows<ImportedSubscription>('forumSubscriptions')
    expect(rows.filter((row) => row.legacyUserId === 1)).toHaveLength(2)
  })

  it('resumes mid-way without losing or duplicating rows', async () => {
    const sink = new MemorySink()
    const source = new FixtureMybbSource(BOARD)

    const first = await runImport({ source, sink, pageSize: 2, budget: 5 })
    expect(first.finished).toBe(false)

    const second = await runImport({ source, sink, pageSize: 2, from: first.cursors })
    expect(second.finished).toBe(true)
    expect(sink.count('forumSubscriptions')).toBe(4)
    expect(sink.count('userRelations')).toBe(3)
  })

  it('maps a sent copy to the sender', async () => {
    const sink = new MemorySink()
    await runImport({ source: new FixtureMybbSource(BOARD), sink })

    const [pm] = sink.rows<ImportedPrivateMessage>('privateMessages')
    expect(pm?.copies).toEqual([{ legacyOwnerId: 1, folder: 'sent', readAt: new Date(NOW * 1000) }])
  })

  it('expands relation lists into pairs', async () => {
    const sink = new MemorySink()
    await runImport({ source: new FixtureMybbSource(BOARD), sink })

    const kinds = sink.rows<ImportedUserRelation>('userRelations').map((row) => row.kind)
    expect(kinds.filter((kind) => kind === 'buddy')).toHaveLength(2)
    expect(kinds.filter((kind) => kind === 'ignore')).toHaveLength(1)
  })
})
