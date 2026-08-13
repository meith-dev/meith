import { verifyPassword } from '@meith/accounts'
import { Authorizer, combinePermissionSets } from '@meith/authorization'
import { PUBLIC_CONTENT } from '@meith/core'
import {
  PostgresAuthorizationSource,
  PostgresSearchRepository,
  resultRows,
  type Database,
} from '@meith/db'
import { DUES_DEMO_GROUP } from '@meith/plugin-dues'
import { createTestDb, type TestDb } from '@meith/db/pglite.fixture'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { DEMO_ACCOUNTS, DEMO_LOGINS } from './accounts'
import { DEMO_FORUMS, DEMO_PREFIXES, DEMO_THREADS } from './content'
import { seedDemoBoard, type SeedSummary } from './seed'

let harness: TestDb
let db: Database
let summary: SeedSummary

/**
 * The seed is the demo. Everything else in this package is plumbing around it,
 * and every failure mode worth catching — a thread naming a forum that does not
 * exist, a post count that stayed at zero, a board nobody can search — only
 * shows up against a real engine.
 */
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

/** The forums a member of exactly these groups is offered, through the real authorizer. */
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

    // Unapproved posts are deliberately not counted, so this is the visible
    // total rather than every row in `posts`.
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
        grouping: 'posts',
        sort: 'relevance',
        limit: 5,
        after: null,
      },
      { forumIds, viewerUserId: null, content: PUBLIC_CONTENT },
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
      await db.execute(sql`select message, message_html as html from posts where message like '> **[%'`),
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
        await count('users', sql`username_lower = ${decodeURIComponent(profile![2]!).toLowerCase()}`),
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

  it('hides the staff forum and the supporters forum rather than locking them', async () => {
    // Not "shows a padlock": a member who cannot read a forum is never told it
    // exists, because the forum tree is built from the forums they can see.
    const committee = await forumIdBySlug('committee-room')
    const supporters = await forumIdBySlug('supporters-room')

    const seen = async (...groups: string[]): Promise<ReadonlySet<number>> =>
      new Set(await visibleTo(await groupIds(...groups)))

    const guest = await seen('guests')
    expect(guest.has(committee), 'a guest is offered the committee room').toBe(false)
    expect(guest.has(supporters), 'a guest is offered the supporters room').toBe(false)

    const ordinary = await seen('registered')
    expect(ordinary.has(committee), 'a member is offered the committee room').toBe(false)
    expect(ordinary.has(supporters), 'a member is offered the supporters room').toBe(false)
    expect(ordinary.size, 'a member sees the rest of the board').toBe(DEMO_FORUMS.length - 2)

    // The plan grants a second group, and a second group is all it takes: the
    // room appears for as long as the grant lasts and goes when it expires,
    // with nobody letting anybody in by hand.
    const supporter = await seen('registered', DUES_DEMO_GROUP)
    expect(supporter.has(supporters), 'a supporter is shut out of the room they pay for').toBe(true)
    expect(supporter.has(committee), 'paying gets a member into the committee room').toBe(false)

    const staff = await seen('moderators')
    expect(staff.has(committee), 'a moderator cannot see the committee room').toBe(true)
    expect(staff.has(supporters), 'a moderator cannot see the supporters room').toBe(true)
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
