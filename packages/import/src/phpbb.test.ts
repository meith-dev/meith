import { describe, expect, it } from 'vitest'

import {
  decodePhpbbText,
  FixturePhpbbSource,
  type ImportedPrivateMessage,
  type ImportedSubscription,
  mapPhpbbAttachment,
  mapPhpbbAvatar,
  mapPhpbbBan,
  mapPhpbbForum,
  mapPhpbbPoll,
  mapPhpbbPost,
  mapPhpbbTopic,
  mapPhpbbUser,
  mapPhpbbZebra,
  pageByGroup,
  runImport,
} from './index'
import { MemorySink } from './memory-sink.fixture'
import type { PhpbbTables } from './phpbb-rows'

const NOW = 1_600_000_000

describe('phpBB text', () => {
  it('strips the bbcode uid phpBB appends to every tag', () => {
    expect(decodePhpbbText('[b:1a2b3c]hi[/b:1a2b3c]', '1a2b3c')).toBe('[b]hi[/b]')
    expect(decodePhpbbText('[quote=&quot;ann&quot;:x9]q[/quote:x9]', 'x9')).toBe(
      '[quote="ann"]q[/quote]',
    )
    expect(decodePhpbbText('[list=1:u1][*:u1]a[/list:u1]', 'u1')).toBe('[list=1][*]a[/list]')
  })

  it('unwraps stored smiley markup back to its code', () => {
    expect(
      decodePhpbbText(
        'hi <!-- s:) --><img src="{SMILIES_PATH}/icon_e_smile.gif" alt=":)" title="Smile" /><!-- s:) -->',
        '',
      ),
    ).toBe('hi :)')
  })

  it('unwraps magic links to the plain URL or a [url] tag', () => {
    expect(
      decodePhpbbText(
        '<!-- m --><a class="postlink" href="https://a.test">https://a.test</a><!-- m -->',
        '',
      ),
    ).toBe('https://a.test')
    expect(
      decodePhpbbText(
        '<!-- m --><a class="postlink" href="https://a.test">the site</a><!-- m -->',
        '',
      ),
    ).toBe('[url=https://a.test]the site[/url]')
    expect(decodePhpbbText('<!-- e --><a href="mailto:a@b.test">a@b.test</a><!-- e -->', '')).toBe(
      'a@b.test',
    )
  })

  it('decodes the HTML entities phpBB stores', () => {
    expect(decodePhpbbText('a &amp; b &lt;3 &quot;x&quot; &#039;y&#039;', '')).toBe(
      'a & b <3 "x" \'y\'',
    )
  })
})

describe('phpBB users', () => {
  const row = (overrides = {}) => ({
    user_id: 5,
    user_type: 0,
    username: 'B&amp;B',
    user_email: 'Five@Example.TEST',
    user_password: '$2y$10$abcdefghijklmnopqrstuv',
    user_regdate: NOW,
    user_lastvisit: NOW,
    user_posts: 3,
    group_id: 2,
    ...overrides,
  })

  it('prefixes the stored hash so it can be verified later', () => {
    expect(mapPhpbbUser(row())?.legacyPasswordHash).toBe('phpbb$$2y$10$abcdefghijklmnopqrstuv')
  })

  it('decodes the entity-encoded username and lower-cases the e-mail', () => {
    expect(mapPhpbbUser(row())).toMatchObject({ username: 'B&B', email: 'five@example.test' })
  })

  it('skips bot accounts', () => {
    expect(mapPhpbbUser(row({ user_type: 2 }))).toBeNull()
  })
})

describe('phpBB forums', () => {
  const row = (overrides = {}) => ({
    forum_id: 2,
    parent_id: 1,
    forum_name: 'General',
    forum_desc: '',
    forum_type: 1,
    forum_link: '',
    left_id: 4,
    ...overrides,
  })

  it('maps the three forum types', () => {
    expect(mapPhpbbForum(row({ forum_type: 0 })).type).toBe('category')
    expect(mapPhpbbForum(row()).type).toBe('forum')
    expect(mapPhpbbForum(row({ forum_type: 2, forum_link: 'https://x.test' }))).toMatchObject({
      type: 'link',
      linkUrl: 'https://x.test',
    })
  })

  it('orders by the nested-set left edge', () => {
    expect(mapPhpbbForum(row()).displayOrder).toBe(4)
  })
})

describe('phpBB topics', () => {
  const row = (overrides = {}) => ({
    topic_id: 7,
    forum_id: 2,
    topic_title: 'Hello',
    topic_poster: 5,
    topic_first_poster_name: 'five',
    topic_time: NOW,
    topic_last_post_time: NOW,
    topic_views: 9,
    topic_posts_approved: 3,
    topic_status: 0,
    topic_type: 0,
    topic_visibility: 1,
    topic_moved_id: 0,
    ...overrides,
  })

  it('derives replies from the approved post count', () => {
    expect(mapPhpbbTopic(row())?.replyCount).toBe(2)
  })

  it('skips shadow topics left behind by a move', () => {
    expect(mapPhpbbTopic(row({ topic_moved_id: 9 }))).toBeNull()
  })

  it('maps visibility, stickiness and locks', () => {
    expect(mapPhpbbTopic(row({ topic_visibility: 2 }))?.visibility).toBe('deleted')
    expect(mapPhpbbTopic(row({ topic_visibility: 0 }))?.visibility).toBe('unapproved')
    expect(mapPhpbbTopic(row({ topic_type: 1 }))?.isSticky).toBe(true)
    expect(mapPhpbbTopic(row({ topic_status: 1 }))?.isLocked).toBe(true)
  })
})

describe('phpBB posts', () => {
  it('cleans the stored text', () => {
    const post = mapPhpbbPost({
      post_id: 1,
      topic_id: 7,
      forum_id: 2,
      poster_id: 5,
      post_username: '',
      post_subject: '',
      post_text: '[b:aa]x[/b:aa] &amp; y',
      bbcode_uid: 'aa',
      post_time: NOW,
      post_edit_time: 0,
      post_visibility: 1,
    })
    expect(post.body).toBe('[b]x[/b] & y')
    expect(post.editedAt).toBeNull()
  })
})

describe('phpBB avatars', () => {
  const row = (overrides = {}) => ({
    user_id: 5,
    user_avatar: '5_1465912764.jpg',
    user_avatar_type: 'avatar.driver.upload',
    user_avatar_width: 90,
    user_avatar_height: 90,
    ...overrides,
  })

  it('points an uploaded avatar at the salted file via a glob', () => {
    expect(mapPhpbbAvatar(row())?.path).toBe('images/avatars/upload/*_5.jpg')
  })

  it('understands the legacy numeric types', () => {
    expect(mapPhpbbAvatar(row({ user_avatar_type: '1' }))?.source).toBe('upload')
    expect(mapPhpbbAvatar(row({ user_avatar_type: '2' }))?.source).toBe('remote')
  })

  it('keeps a gallery path under the gallery directory', () => {
    expect(
      mapPhpbbAvatar(row({ user_avatar_type: 'avatar.driver.gallery', user_avatar: 'set/cat.png' }))
        ?.path,
    ).toBe('images/avatars/gallery/set/cat.png')
  })
})

describe('phpBB attachments', () => {
  it('locates the physical file under files/', () => {
    expect(
      mapPhpbbAttachment({
        attach_id: 3,
        post_msg_id: 1,
        poster_id: 5,
        real_filename: 'photo.jpg',
        physical_filename: '3_deadbeef',
        mimetype: 'image/jpeg',
        filesize: 100,
        download_count: 2,
        filetime: NOW,
        thumbnail: 1,
      }),
    ).toMatchObject({
      path: 'files/3_deadbeef',
      thumbnailPath: 'files/thumb_3_deadbeef',
      filename: 'photo.jpg',
    })
  })
})

describe('phpBB polls', () => {
  const topic = {
    topic_id: 7,
    poll_title: 'Q?',
    poll_start: NOW,
    poll_length: 0,
    poll_max_options: 1,
    poll_vote_change: 0,
  }
  const options = [
    { topic_id: 7, poll_option_id: 1, poll_option_text: 'A', poll_option_total: 2 },
    { topic_id: 7, poll_option_id: 2, poll_option_text: 'B', poll_option_total: 0 },
    { topic_id: 9, poll_option_id: 1, poll_option_text: 'other topic', poll_option_total: 0 },
  ]

  it('collects only its own options, keyed by option id', () => {
    expect(mapPhpbbPoll(topic, options)?.options).toEqual([
      { order: 1, label: 'A', voteCount: 2 },
      { order: 2, label: 'B', voteCount: 0 },
    ])
  })

  it('reads poll_length seconds into a closing date', () => {
    expect(mapPhpbbPoll({ ...topic, poll_length: 60 }, options)?.closesAt).toEqual(
      new Date((NOW + 60) * 1000),
    )
  })

  it('carries the choice limit and re-voting across', () => {
    expect(
      mapPhpbbPoll({ ...topic, poll_max_options: 2, poll_vote_change: 1 }, options),
    ).toMatchObject({ maxOptions: 2, allowRevote: true, publicVotes: false })
  })

  it('clamps a choice limit larger than the poll has options', () => {
    expect(mapPhpbbPoll({ ...topic, poll_max_options: 9 }, options)?.maxOptions).toBe(2)
  })

  it('treats a missing choice limit as a single choice', () => {
    expect(mapPhpbbPoll({ ...topic, poll_max_options: 0 }, options)?.maxOptions).toBe(1)
  })
})

describe('phpBB bans', () => {
  const row = (overrides = {}) => ({
    ban_id: 1,
    ban_userid: 5,
    ban_start: NOW,
    ban_end: 0,
    ban_exclude: 0,
    ban_reason: 'Spam',
    ban_give_reason: 'Breaking the rules',
    ...overrides,
  })

  it('keeps both the private and the shown reason', () => {
    expect(mapPhpbbBan(row())).toMatchObject({
      reason: 'Spam',
      publicReason: 'Breaking the rules',
      expiresAt: null,
    })
  })

  it('skips e-mail and IP bans, and exclusions', () => {
    expect(mapPhpbbBan(row({ ban_userid: 0 }))).toBeNull()
    expect(mapPhpbbBan(row({ ban_exclude: 1 }))).toBeNull()
  })
})

describe('phpBB friends and foes', () => {
  it('maps friends to buddies and foes to ignores', () => {
    expect(mapPhpbbZebra({ user_id: 1, zebra_id: 2, friend: 1, foe: 0 })?.kind).toBe('buddy')
    expect(mapPhpbbZebra({ user_id: 1, zebra_id: 2, friend: 0, foe: 1 })?.kind).toBe('ignore')
    expect(mapPhpbbZebra({ user_id: 1, zebra_id: 2, friend: 0, foe: 0 })).toBeNull()
  })
})

describe('group paging', () => {
  const rows = [
    { g: 1, v: 1 },
    { g: 1, v: 2 },
    { g: 2, v: 1 },
    { g: 3, v: 1 },
    { g: 3, v: 2 },
    { g: 3, v: 3 },
  ]
  const fetch = (afterGroup: number, limit: number) =>
    Promise.resolve(rows.filter((row) => row.g > afterGroup).slice(0, limit))
  const fetchGroup = (group: number) => Promise.resolve(rows.filter((row) => row.g === group))

  it('drops a possibly-incomplete trailing group and resumes at it', async () => {
    const page = await pageByGroup({
      afterGroup: 0,
      limit: 3,
      groupOf: (r) => r.g,
      fetch,
      fetchGroup,
    })
    expect(page.rows.map((r) => r.g)).toEqual([1, 1])
    expect(page.nextCursor).toBe(1)
  })

  it('fetches a group larger than the page in full', async () => {
    const page = await pageByGroup({
      afterGroup: 2,
      limit: 2,
      groupOf: (r) => r.g,
      fetch,
      fetchGroup,
    })
    expect(page.rows).toHaveLength(3)
    expect(page.nextCursor).toBe(3)
  })

  it('finishes on a short page', async () => {
    const page = await pageByGroup({
      afterGroup: 3,
      limit: 3,
      groupOf: (r) => r.g,
      fetch,
      fetchGroup,
    })
    expect(page).toEqual({ rows: [], nextCursor: null })
  })
})

const BOARD: PhpbbTables = {
  users: [
    {
      user_id: 1,
      user_type: 0,
      username: 'one',
      user_email: 'one@example.test',
      user_password: '$2y$10$x',
      user_regdate: NOW,
      user_lastvisit: NOW,
      user_posts: 1,
      group_id: 2,
    },
    {
      user_id: 2,
      user_type: 2,
      username: 'crawler',
      user_email: 'bot@example.test',
      user_password: '',
      user_regdate: NOW,
      user_lastvisit: 0,
      user_posts: 0,
      group_id: 6,
    },
  ],
  forums: [
    {
      forum_id: 1,
      parent_id: 0,
      forum_name: 'Category',
      forum_desc: '',
      forum_type: 0,
      forum_link: '',
      left_id: 1,
    },
    {
      forum_id: 2,
      parent_id: 1,
      forum_name: 'General',
      forum_desc: '',
      forum_type: 1,
      forum_link: '',
      left_id: 2,
    },
  ],
  topics: [
    {
      topic_id: 1,
      forum_id: 2,
      topic_title: 'Hello',
      topic_poster: 1,
      topic_first_poster_name: 'one',
      topic_time: NOW,
      topic_last_post_time: NOW,
      topic_views: 1,
      topic_posts_approved: 2,
      topic_status: 0,
      topic_type: 0,
      topic_visibility: 1,
      topic_moved_id: 0,
    },
  ],
  posts: [
    {
      post_id: 1,
      topic_id: 1,
      forum_id: 2,
      poster_id: 1,
      post_username: '',
      post_subject: 'Hello',
      post_text: 'First.',
      bbcode_uid: '',
      post_time: NOW,
      post_edit_time: 0,
      post_visibility: 1,
    },
    {
      post_id: 2,
      topic_id: 1,
      forum_id: 2,
      poster_id: 1,
      post_username: '',
      post_subject: '',
      post_text: 'Second.',
      bbcode_uid: '',
      post_time: NOW + 1,
      post_edit_time: 0,
      post_visibility: 1,
    },
  ],
  avatars: [
    {
      user_id: 1,
      user_avatar: '1_123.png',
      user_avatar_type: 'avatar.driver.upload',
      user_avatar_width: 90,
      user_avatar_height: 90,
    },
  ],
  attachments: [
    {
      attach_id: 1,
      post_msg_id: 2,
      poster_id: 1,
      real_filename: 'a.png',
      physical_filename: '1_aa',
      mimetype: 'image/png',
      filesize: 5,
      download_count: 0,
      filetime: NOW,
      thumbnail: 0,
    },
  ],
  pollTopics: [
    {
      topic_id: 1,
      poll_title: 'Q?',
      poll_start: NOW,
      poll_length: 0,
      poll_max_options: 1,
      poll_vote_change: 0,
    },
  ],
  pollOptions: [
    { topic_id: 1, poll_option_id: 1, poll_option_text: 'A', poll_option_total: 1 },
    { topic_id: 1, poll_option_id: 2, poll_option_text: 'B', poll_option_total: 0 },
  ],
  pollVotes: [{ topic_id: 1, poll_option_id: 1, vote_user_id: 1 }],
  privateMessages: [
    {
      msg_id: 1,
      author_id: 1,
      message_subject: 'S',
      message_text: 'M',
      bbcode_uid: '',
      message_time: NOW,
    },
  ],
  privateMessageCopies: [
    { msg_id: 1, user_id: 1, author_id: 1, folder_id: -1, pm_deleted: 0, pm_unread: 0 },
    { msg_id: 1, user_id: 3, author_id: 1, folder_id: 0, pm_deleted: 0, pm_unread: 1 },
  ],
  topicWatch: [
    { user_id: 1, target_id: 1 },
    { user_id: 3, target_id: 1 },
  ],
  forumWatch: [{ user_id: 1, target_id: 2 }],
  warnings: [{ warning_id: 1, user_id: 1, post_id: 0, warning_time: NOW }],
  bans: [
    {
      ban_id: 1,
      ban_userid: 3,
      ban_start: NOW,
      ban_end: 0,
      ban_exclude: 0,
      ban_reason: '',
      ban_give_reason: '',
    },
  ],
  zebra: [{ user_id: 1, zebra_id: 3, friend: 1, foe: 0 }],
}

describe('the phpBB fixture round trip', () => {
  it('imports every kind, skipping bots', async () => {
    const sink = new MemorySink()
    const report = await runImport({ source: new FixturePhpbbSource(BOARD), sink })

    expect(report.finished).toBe(true)
    expect(sink.count('users')).toBe(1)
    expect(sink.count('forums')).toBe(2)
    expect(sink.count('threads')).toBe(1)
    expect(sink.count('posts')).toBe(2)
    expect(sink.count('avatars')).toBe(1)
    expect(sink.count('attachments')).toBe(1)
    expect(sink.count('polls')).toBe(1)
    expect(sink.count('pollVotes')).toBe(1)
    expect(sink.count('privateMessages')).toBe(1)
    expect(sink.count('threadSubscriptions')).toBe(2)
    expect(sink.count('forumSubscriptions')).toBe(1)
    expect(sink.count('reputation')).toBe(0)
    expect(sink.count('warnings')).toBe(1)
    expect(sink.count('bans')).toBe(1)
    expect(sink.count('userRelations')).toBe(1)
  })

  it('groups every recipient copy under one message', async () => {
    const sink = new MemorySink()
    await runImport({ source: new FixturePhpbbSource(BOARD), sink })

    const [pm] = sink.rows<ImportedPrivateMessage>('privateMessages')
    expect(pm?.copies).toEqual([
      { legacyOwnerId: 1, folder: 'sent', readAt: new Date(NOW * 1000) },
      { legacyOwnerId: 3, folder: 'inbox', readAt: null },
    ])
  })

  it('resumes with small pages without losing watch rows', async () => {
    const sink = new MemorySink()
    const source = new FixturePhpbbSource(BOARD)

    const first = await runImport({ source, sink, pageSize: 1, budget: 6 })
    const second = await runImport({ source, sink, pageSize: 1, from: first.cursors })

    expect(second.finished).toBe(true)
    expect(sink.count('threadSubscriptions')).toBe(2)
    const rows = sink.rows<ImportedSubscription>('threadSubscriptions')
    expect(rows.every((row) => row.mode === 'instant')).toBe(true)
  })
})
