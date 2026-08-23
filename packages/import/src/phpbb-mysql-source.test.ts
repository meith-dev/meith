import { describe, expect, it } from 'vitest'

import { MysqlPhpbbSource } from './phpbb-mysql-source'

interface Recorded {
  readonly sql: string
  readonly values: readonly unknown[]
}

function fakeConnection(pages: readonly (readonly unknown[])[]) {
  const log: Recorded[] = []
  let call = 0

  const connection = {
    query: async (sql: string, values: readonly unknown[]) => {
      log.push({ sql, values })
      return [pages[call++] ?? [], null] as [unknown, unknown]
    },
    end: async () => {},
  }

  return { connection, log }
}

function sourceOver(pages: readonly (readonly unknown[])[], prefix = 'phpbb_') {
  const { connection, log } = fakeConnection(pages)
  const Ctor = MysqlPhpbbSource as unknown as new (c: unknown, p: string) => MysqlPhpbbSource
  return { source: new Ctor(connection, prefix), log }
}

describe('the statements it issues', () => {
  it('only ever selects, across every kind', async () => {
    const { source, log } = sourceOver([])

    await source.users(0, 10)
    await source.forums(0, 10)
    await source.threads(0, 10)
    await source.posts(0, 10)
    await source.avatars(0, 10)
    await source.attachments(0, 10)
    await source.polls(0, 10)
    await source.pollVotes(0, 10)
    await source.privateMessages(0, 10)
    await source.threadSubscriptions(0, 10)
    await source.forumSubscriptions(0, 10)
    await source.reputation()
    await source.warnings(0, 10)
    await source.bans(0, 10)
    await source.userRelations(0, 10)

    expect(log.length).toBeGreaterThan(10)
    for (const { sql } of log) {
      expect(sql.trimStart().toLowerCase().startsWith('select')).toBe(true)
      expect(sql).not.toMatch(/\b(insert|update|delete|drop|alter|truncate|replace)\b/i)
    }
  })

  it('reads each table under the configured prefix', async () => {
    const { source, log } = sourceOver([], 'board_')

    await source.users(0, 1)
    await source.bans(0, 1)
    await source.userRelations(0, 1)

    expect(log.map((entry) => entry.sql)).toEqual([
      expect.stringContaining('`board_users`'),
      expect.stringContaining('`board_banlist`'),
      expect.stringContaining('`board_zebra`'),
    ])
  })

  it('excludes bots nowhere and message attachments in SQL', async () => {
    const { source, log } = sourceOver([])
    await source.attachments(0, 5)
    expect(log[0]!.sql).toContain('in_message = 0')
  })

  it('asks a poll page only for its own options', async () => {
    const { source, log } = sourceOver([
      [
        { topic_id: 4, poll_title: 'Q', poll_start: 1, poll_length: 0 },
        { topic_id: 9, poll_title: 'R', poll_start: 1, poll_length: 0 },
      ],
      [{ topic_id: 4, poll_option_id: 1, poll_option_text: 'A', poll_option_total: 0 }],
    ])

    await source.polls(0, 5)

    expect(log[1]!.sql).toContain('poll_options')
    expect(log[1]!.values).toEqual([4, 9])
  })

  it('fetches the recipient copies of each message page', async () => {
    const { source, log } = sourceOver([
      [
        {
          msg_id: 3,
          author_id: 1,
          message_subject: 's',
          message_text: 'm',
          bbcode_uid: '',
          message_time: 1,
        },
      ],
      [{ msg_id: 3, user_id: 2, author_id: 1, folder_id: 0, pm_deleted: 0, pm_unread: 1 }],
    ])

    const page = await source.privateMessages(0, 5)

    expect(log[1]!.sql).toContain('privmsgs_to')
    expect(log[1]!.values).toEqual([3])
    expect(page.rows[0]?.copies).toHaveLength(1)
  })

  it('re-fetches a watch group in full when it outgrows the page', async () => {
    const { source, log } = sourceOver([
      [
        { user_id: 6, target_id: 1 },
        { user_id: 6, target_id: 2 },
      ],
      [
        { user_id: 6, target_id: 1 },
        { user_id: 6, target_id: 2 },
        { user_id: 6, target_id: 3 },
      ],
    ])

    const page = await source.threadSubscriptions(0, 2)

    expect(log[1]!.sql).toContain('where user_id = ?')
    expect(page.rows).toHaveLength(3)
    expect(page.nextCursor).toBe(6)
  })
})

describe('the reputation kind', () => {
  it('is empty — phpBB has no reputation system', async () => {
    const { source, log } = sourceOver([])
    expect(await source.reputation()).toEqual({ rows: [], nextCursor: null })
    expect(log).toHaveLength(0)
  })
})
