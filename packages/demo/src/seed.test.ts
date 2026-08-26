import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { verifyPassword } from '@meith/accounts'
import { Authorizer, combinePermissionSets } from '@meith/authorization'
import { PUBLIC_CONTENT } from '@meith/core'
import {
  type Database,
  PostgresAuthorizationSource,
  PostgresSearchRepository,
  resultRows,
} from '@meith/db'
import { createTestDb, type TestDb } from '@meith/db/pglite.fixture'
import { DUES_DEMO_GROUP } from '@meith/plugin-dues'

import { DEMO_ACCOUNTS, DEMO_LOGINS } from './accounts'
import { DEMO_FORUMS, DEMO_PREFIXES, DEMO_THREADS } from './content'
import { type SeedSummary, seedDemoBoard } from './seed'

let harness: TestDb
let db: Database
let summary: SeedSummary

const NOW = new Date('2026-08-10T09:00:00Z')

beforeAll(async () => {
  harness = await createTestDb()
  db = harness.db
  summary = await seedDemoBoard(db, NOW)
}, 120_000)

afterAll(async () => {
  await harness.close()
})

async function count(table: string, where = sql`true`): Promise<number> {
  const rows = resultRows(
    await db.execute(sql`select count(*)::int as n from ${sql.raw(table)} where ${where}`),
  ) as Array<{ n: number }>
  return rows[0]?.n ?? 0
}

async function sectionIds(access: 'staff' | 'supporters'): Promise<ReadonlySet<number>> {
  const slugs = DEMO_FORUMS.filter((forum) => forum.access === access).map((forum) => forum.slug)
  expect(slugs.length).toBeGreaterThan(1)

  const ids = await Promise.all(slugs.map((slug) => forumIdBySlug(slug)))
  return new Set(ids)
}

async function forumIdBySlug(slug: string): Promise<number> {
  const rows = resultRows(
    await db.execute(sql`select id from forums where slug = ${slug}`),
  ) as Array<{ id: number }>
  return Number(rows[0]!.id)
}

async function groupIds(...keys: readonly string[]): Promise<readonly number[]> {
  const rows = resultRows(
    await db.execute(sql`
      select id, key from usergroups where key in ${sql`(${sql.join(
        keys.map((key) => sql`${key}`),
        sql`, `,
      )})`}
    `),
  ) as Array<{ id: number; key: string }>

  expect(rows).toHaveLength(keys.length)
  return rows.map((row) => Number(row.id))
}

async function visibleTo(ids: readonly number[]): Promise<readonly number[]> {
  const source = new PostgresAuthorizationSource(db)
  const groups = await source.groupDefaults(ids)

  return new Authorizer(source).visibleForumIds({
    userId: ids.includes(1) ? null : 1,
    groupIds: [...ids],
    primaryGroupId: ids[0] ?? null,
    state: ids.includes(1) ? 'guest' : 'active',
    global: combinePermissionSets(groups.map((group) => group.permissions)),
    permissionVersion: 1,
  })
}

describe('the seeded board', () => {
  it('writes every account, forum and thread the content declares', async () => {
    expect(summary.members).toBe(DEMO_ACCOUNTS.length)
    expect(summary.forums).toBe(DEMO_FORUMS.length)
    expect(summary.threads).toBe(DEMO_THREADS.length)

    expect(await count('users')).toBe(DEMO_ACCOUNTS.length)
    expect(await count('forums')).toBe(DEMO_FORUMS.length)
    expect(await count('threads')).toBe(DEMO_THREADS.length)
    expect(await count('posts')).toBe(summary.posts)
  })

  it('has more posts than threads, which is what makes it read as a board', () => {
    expect(summary.posts).toBeGreaterThan(summary.threads * 2)
  })

  it('lets a visitor log in with the password printed on the banner', async () => {
    const rows = resultRows(
      await db.execute(sql`
        select password_hash from users where username_lower = ${DEMO_LOGINS.admin.username}
      `),
    ) as Array<{ password_hash: string | null }>

    const hash = rows[0]?.password_hash
    expect(hash).toBeTruthy()
    await expect(verifyPassword(DEMO_LOGINS.admin.password, hash!)).resolves.toBe(true)
  })

  it('gives the authors the post counts they earned', async () => {
    const rows = resultRows(
      await db.execute(sql`
        select sum(post_count)::int as total from users
      `),
    ) as Array<{ total: number }>

    const visible = await count('posts', sql`visibility = 'visible'`)
    expect(rows[0]?.total).toBe(visible)
  })

  it('indexes every visible post, so search works on a freshly seeded board', async () => {
    const progress = await new PostgresSearchRepository(db).indexProgress()
    expect(progress.pending).toBe(0)
    expect(progress.indexed).toBeGreaterThan(0)
  })

  it('finds a phrase from the middle of a reply', async () => {
    const forumIds = (
      resultRows(await db.execute(sql`select id from forums`)) as Array<{ id: number }>
    ).map((row) => Number(row.id))

    const results = await new PostgresSearchRepository(db).search(
      {
        terms: 'reindex findable background',
        match: 'everything',
        grouping: 'posts',
        sort: 'relevance',
        limit: 5,
        after: null,
      },
      { forumIds, ownThreadsOnlyForumIds: [], viewerUserId: null, content: PUBLIC_CONTENT },
    )

    expect(results.hits.length).toBeGreaterThan(0)
  })

  it('leaves something in the moderation queue and the reports list', async () => {
    expect(await count('posts', sql`visibility = 'unapproved'`)).toBeGreaterThan(0)
    expect(await count('reports', sql`status = 'open'`)).toBeGreaterThan(0)
  })

  it('leaves private messages in an inbox', async () => {
    expect(await count('private_messages')).toBeGreaterThan(0)
  })

  it('records poll votes against real members', async () => {
    const rows = resultRows(
      await db.execute(sql`select sum(vote_count)::int as total from poll_options`),
    ) as Array<{ total: number | null }>

    expect(rows[0]?.total).toBe(await count('poll_votes'))
    expect(await count('poll_votes')).toBeGreaterThan(0)
  })

  it('dates the newest post minutes before the reset, not months', async () => {
    const rows = resultRows(
      await db.execute(sql`select max(created_at) as newest from posts`),
    ) as Array<{ newest: Date | string }>

    const newest = new Date(rows[0]!.newest)
    const hoursOld = (NOW.getTime() - newest.getTime()) / 3_600_000
    expect(hoursOld).toBeLessThan(24)
  })

  it('never has a member last seen before they joined', async () => {
    expect(await count('users', sql`last_active_at < created_at`)).toBe(0)
  })

  it('sticks and locks the threads the content asks it to', async () => {
    expect(await count('threads', sql`is_sticky`)).toBe(
      DEMO_THREADS.filter((thread) => thread.sticky === true).length,
    )
    expect(await count('threads', sql`is_locked`)).toBe(
      DEMO_THREADS.filter((thread) => thread.locked === true).length,
    )
  })

  it('quotes with a live profile link and a live link back to the post', async () => {
    const quoting = DEMO_THREADS.flatMap((thread) => thread.replies ?? []).filter(
      (reply) => reply.quotes !== undefined,
    )
    expect(quoting.length).toBeGreaterThan(0)

    const rows = resultRows(
      await db.execute(
        sql`select message, message_html as html from posts where message like '> **[%'`,
      ),
    ) as Array<{ message: string; html: string }>
    expect(rows).toHaveLength(quoting.length)

    for (const row of rows) {
      const source = /\[View post\]\(\/thread\/(\d+)-[^?]+\?post=(\d+)\)/.exec(row.message)
      expect(source).not.toBeNull()

      const [, threadId, postId] = source!
      expect(
        await count('posts', sql`id = ${Number(postId)} and thread_id = ${Number(threadId)}`),
      ).toBe(1)

      const profile = /\[([^\]]+)\]\(\/member\/by-name\/([^)]+)\)/.exec(row.message)
      expect(profile).not.toBeNull()
      expect(
        await count(
          'users',
          sql`username_lower = ${decodeURIComponent(profile![2]!).toLowerCase()}`,
        ),
      ).toBe(1)

      expect(row.html).toContain('class="md-quote-source"')
      expect(row.html).toContain('class="md-quote-author"')
    }
  })

  it('colours the three staff groups differently in both schemes', async () => {
    const rows = resultRows(
      await db.execute(sql`
        select key, name_color_light as light, name_color_dark as dark
          from usergroups
         where key in ('administrators', 'super_moderators', 'moderators')
         order by key
      `),
    ) as Array<{ key: string; light: string | null; dark: string | null }>

    expect(rows).toHaveLength(3)
    for (const row of rows) {
      expect(row.light, `${row.key} in light`).toMatch(/^#[0-9a-f]{6}$/)
      expect(row.dark, `${row.key} in dark`).toMatch(/^#[0-9a-f]{6}$/)
    }

    for (const scheme of ['light', 'dark'] as const) {
      const used = rows.map((row) => row[scheme])
      expect(new Set(used).size, `${scheme} colours`).toBe(rows.length)
    }
  })

  it('hides the two restricted sections rather than locking them', async () => {
    const staffSection = await sectionIds('staff')
    const supportersSection = await sectionIds('supporters')
    const open = DEMO_FORUMS.length - staffSection.size - supportersSection.size

    const seen = async (...groups: string[]): Promise<ReadonlySet<number>> =>
      new Set(await visibleTo(await groupIds(...groups)))

    const holds = (
      what: ReadonlySet<number>,
      section: ReadonlySet<number>,
    ): 'all' | 'none' | 'some' => {
      const inside = [...section].filter((id) => what.has(id)).length
      if (inside === 0) return 'none'
      return inside === section.size ? 'all' : 'some'
    }

    const guest = await seen('guests')
    expect(holds(guest, staffSection), 'a guest is offered the committee room').toBe('none')
    expect(holds(guest, supportersSection), "a guest is offered the supporters' club").toBe('none')

    const ordinary = await seen('registered')
    expect(holds(ordinary, staffSection), 'a member is offered the committee room').toBe('none')
    expect(holds(ordinary, supportersSection), "a member is offered the supporters' club").toBe(
      'none',
    )
    expect(ordinary.size, 'a member sees the rest of the board').toBe(open)

    const supporter = await seen('registered', DUES_DEMO_GROUP)
    expect(
      holds(supporter, supportersSection),
      'a supporter is shut out of what they pay for',
    ).toBe('all')
    expect(holds(supporter, staffSection), 'paying gets a member into the committee room').toBe(
      'none',
    )

    const staff = await seen('moderators')
    expect(holds(staff, staffSection), 'a moderator cannot see the committee room').toBe('all')
    expect(holds(staff, supportersSection), "a moderator cannot see the supporters' club").toBe(
      'all',
    )
  })

  it('writes the staff in as allowed rather than leaving it to be known', async () => {
    for (const forum of DEMO_FORUMS) {
      if (forum.access === undefined) continue

      const allowed = await count(
        'forum_permissions p join forums f on f.id = p.forum_id ' +
          'join usergroups g on g.id = p.group_id',
        sql`f.slug = ${forum.slug} and g.key = 'administrators' and p.can_view = true`,
      )
      expect(allowed, `${forum.title} does not name the administrators`).toBe(1)

      const denied = await count(
        'forum_permissions p join forums f on f.id = p.forum_id ' +
          'join usergroups g on g.id = p.group_id',
        sql`f.slug = ${forum.slug} and g.key = 'registered' and p.can_view = false`,
      )
      expect(denied, `${forum.title} is open to ordinary members`).toBe(1)
    }
  })

  it('puts the two restricted sections at the top of the board', async () => {
    const rows = resultRows(
      await db.execute(sql`
        select slug from forums where parent_id is null order by display_order, id
      `),
    ) as Array<{ slug: string }>

    expect(rows.map((row) => row.slug).slice(0, 2)).toEqual(['committee-room', 'supporters-club'])
  })

  it('scopes every prefix to the branch it belongs to, and uses them', async () => {
    const rows = resultRows(
      await db.execute(sql`select label, forum_path_prefix as path from thread_prefixes`),
    ) as Array<{ label: string; path: string | null }>

    expect(rows.length).toBe(DEMO_PREFIXES.length)
    for (const row of rows) expect(row.path, `${row.label} is offered everywhere`).not.toBeNull()

    expect(await count('threads', sql`prefix_id is not null`)).toBe(
      DEMO_THREADS.filter((thread) => thread.prefix !== undefined).length,
    )
  })

  it('seals the installer, so /install is not a way back into a live demo', async () => {
    expect(await count('install_state')).toBe(1)
  })
})
