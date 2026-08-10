import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'

import { hashPassword } from '@meith/accounts'

import {
  E2E_DATABASE_URL,
  E2E_DB_PORT,
  E2E_INSTALL_DATABASE_URL,
  E2E_INSTALL_DB_PORT,
  E2E_UPLOADS_DIR,
  STAFF,
  STAFF_PASSWORD,
} from './config'
import { samplePng } from './png'

import {
  SEED_FORUM_ROWS,
  SEED_MEMBER_PROFILES,
  SEED_POST_ROWS,
  SEED_THREAD_ROWS,
} from '../../apps/community/src/server/seed-board'

const here = path.dirname(fileURLToPath(import.meta.url))
const MIGRATIONS = path.resolve(here, '../../packages/db/migrations')

function migrationSql(): string {
  const journal = JSON.parse(
    readFileSync(path.join(MIGRATIONS, 'meta', '_journal.json'), 'utf8'),
  ) as { entries: { idx: number; tag: string }[] }

  return [...journal.entries]
    .sort((a, b) => a.idx - b.idx)
    .map((entry) => readFileSync(path.join(MIGRATIONS, `${entry.tag}.sql`), 'utf8'))
    .join('\n')
    .replaceAll('--> statement-breakpoint', '')
}

const RATER_ID = 9001

const MODERATOR_ID = STAFF.moderator.id

const BADGE_KEYS = {
  light: 'group/3/badge-light-11111111-1111-1111-1111-111111111111.png',
  dark: 'group/3/badge-dark-22222222-2222-2222-2222-222222222222.png',
} as const

async function seedBadgeFiles(): Promise<void> {
  for (const key of Object.values(BADGE_KEYS)) {
    const target = path.join(E2E_UPLOADS_DIR, key)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, samplePng(64, 16))
  }
}

function literal(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (value instanceof Date) return `'${value.toISOString()}'`
  return `'${String(value).replaceAll("'", "''")}'`
}

function insert(table: string, rows: readonly Record<string, unknown>[]): string {
  if (rows.length === 0) return ''
  const columns = Object.keys(rows[0] as Record<string, unknown>)
  const values = rows
    .map((row) => `(${columns.map((column) => literal(row[column])).join(', ')})`)
    .join(',\n       ')

  return `insert into ${table} (${columns.join(', ')}) values\n       ${values};`
}

function seedSql(staffHash: string): string {
  const authors = new Map<number, string>()
  for (const post of SEED_POST_ROWS) {
    if (post.authorUserId !== null) authors.set(post.authorUserId, post.authorUsername)
  }
  for (const thread of SEED_THREAD_ROWS) {
    if (thread.authorUserId !== null) authors.set(thread.authorUserId, thread.authorUsername)
  }

  const profiles = new Map(SEED_MEMBER_PROFILES.map((profile) => [profile.id, profile]))

  const users = [...authors].map(([id, username]) => {
    const profile = profiles.get(id)
    return {
      id,
      username,
      username_lower: username.toLowerCase(),
      email: `${username.toLowerCase()}@example.test`,
      email_lower: `${username.toLowerCase()}@example.test`,
      password_hash: id === 1 ? staffHash : 'x',
      password_algo: 'argon2id',
      primary_group_id: id === 1 ? 3 : 2,
      post_count: profile?.postCount ?? 0,
      created_at: profile?.createdAt ?? new Date('2026-01-01T00:00:00Z'),
      location: profile?.location ?? null,
      website: profile?.website ?? null,
      bio: profile?.bio ?? null,
    }
  })

  const forums = SEED_FORUM_ROWS.map((forum) => ({
    id: forum.id,
    type: forum.type,
    allow_threads: forum.allowThreads,
    title: forum.title,
    slug: forum.slug,
    description: forum.description,
    parent_id: forum.parentId,
    path: forum.path,
    depth: forum.depth,
    display_order: forum.displayOrder,
    link_url: forum.linkUrl,
    thread_count: forum.threadCount,
    post_count: forum.postCount,
    last_post_id: forum.lastPost?.postId ?? null,
    last_post_thread_id: forum.lastPost?.threadId ?? null,
    last_post_thread_title: forum.lastPost?.threadTitle ?? null,
    last_post_user_id: forum.lastPost?.userId ?? null,
    last_post_username: forum.lastPost?.username ?? null,
    last_post_at: forum.lastPost?.at ?? null,
  }))

  const threads = SEED_THREAD_ROWS.map((thread) => ({
    id: thread.id,
    forum_id: thread.forumId,
    title: thread.title,
    slug: thread.slug,
    author_user_id: thread.authorUserId,
    author_username: thread.authorUsername,
    reply_count: thread.replyCount,
    view_count: thread.viewCount,
    rating_total: thread.ratingTotal,
    rating_count: thread.ratingCount,
    visibility: thread.visibility,
    is_sticky: thread.isSticky,
    is_locked: thread.isLocked,
    first_post_id: SEED_POST_ROWS.find((p) => p.threadId === thread.id && p.isFirstPost)?.id ?? null,
    last_post_id: thread.lastPost?.postId ?? null,
    last_post_at: thread.lastPost?.at ?? null,
    last_post_user_id: thread.lastPost?.userId ?? null,
    last_post_username: thread.lastPost?.username ?? null,
    created_at: SEED_POST_ROWS.find((p) => p.threadId === thread.id && p.isFirstPost)?.createdAt
      ?? new Date('2026-07-29T09:00:00Z'),
  }))

  const posts = SEED_POST_ROWS.map((post) => ({
    id: post.id,
    thread_id: post.threadId,
    forum_id: post.forumId,
    author_user_id: post.authorUserId,
    author_username: post.authorUsername,
    message: post.message,
    message_html: null,
    render_version: 0,
    is_first_post: post.isFirstPost,
    visibility: post.visibility,
    created_at: post.createdAt,
  }))

  const memberships = users.map((user) => ({
    user_id: user.id,
    group_id: user.primary_group_id,
  }))

  const settings = [
    { key: 'antispam.min_form_seconds', value: '0', group_key: 'antispam' },
    { key: 'reputation.min_posts_to_give', value: '0', group_key: 'reputation' },
    { key: 'registration.method', value: 'none', group_key: 'registration' },
    { key: 'search.flood_seconds', value: '0', group_key: 'search' },
    { key: 'posting.flood_seconds', value: '0', group_key: 'posting' },
  ]

  const styledGroup = [
    `update usergroups set
       name_color_light = 'oklch(0.45 0.13 155)',
       name_color_dark = 'oklch(0.85 0.14 155)',
       badge_image_light = ${literal(BADGE_KEYS.light)},
       badge_image_dark = ${literal(BADGE_KEYS.dark)}
     where id = 3;`,
    insert('users', [
      {
        id: RATER_ID,
        username: 'wellwisher',
        username_lower: 'wellwisher',
        email: 'wellwisher@example.test',
        email_lower: 'wellwisher@example.test',
        password_hash: 'x',
        password_algo: 'argon2id',
        primary_group_id: 2,
        post_count: 0,
        created_at: new Date('2026-01-02T00:00:00Z'),
      },
    ]),
    insert('user_group_memberships', [{ user_id: RATER_ID, group_id: 2 }]),
    insert('reputation', [
      {
        user_id: 1,
        given_by_user_id: RATER_ID,
        post_id: null,
        points: 1,
        comment: 'Runs a good board.',
        created_at: new Date('2026-02-01T00:00:00Z'),
        updated_at: new Date('2026-02-01T00:00:00Z'),
      },
    ]),
    'update users set reputation = (select coalesce(sum(points), 0) from reputation where user_id = 1) where id = 1;',
  ]

  const staff = [
    insert('users', [
      {
        id: MODERATOR_ID,
        username: STAFF.moderator.username,
        username_lower: STAFF.moderator.username.toLowerCase(),
        email: `${STAFF.moderator.username.toLowerCase()}@example.test`,
        email_lower: `${STAFF.moderator.username.toLowerCase()}@example.test`,
        password_hash: staffHash,
        password_algo: 'argon2id',
        primary_group_id: 4,
        post_count: 0,
        created_at: new Date('2026-01-03T00:00:00Z'),
      },
    ]),
    insert('user_group_memberships', [{ user_id: MODERATOR_ID, group_id: 4 }]),
  ]

  return [
    insert('users', users),
    insert('user_group_memberships', memberships),
    insert('settings', settings),
    ...styledGroup,
    ...staff,
    insert('forums', forums),
    insert('threads', threads),
    insert('posts', posts),
    "select setval(pg_get_serial_sequence('users', 'id'), (select max(id) from users));",
    "select setval(pg_get_serial_sequence('forums', 'id'), (select max(id) from forums));",
    "select setval(pg_get_serial_sequence('threads', 'id'), (select max(id) from threads));",
    "select setval(pg_get_serial_sequence('posts', 'id'), (select max(id) from posts));",
  ]
    .filter((statement) => statement !== '')
    .join('\n')
}

export interface DatabaseOptions {
  readonly seeded?: boolean
  readonly port?: number
  readonly maxConnections?: number
}

export async function startDatabase(
  options: DatabaseOptions = {},
): Promise<{ stop: () => Promise<void> }> {
  const seeded = options.seeded ?? true

  const db = await PGlite.create()
  if (seeded) {
    await db.exec(migrationSql())
    await db.exec(seedSql(await hashPassword(STAFF_PASSWORD)))
    await seedBadgeFiles()
  }

  const server = new PGLiteSocketServer({
    db,
    port: options.port ?? E2E_DB_PORT,
    host: '127.0.0.1',
    maxConnections: options.maxConnections ?? 1,
  })
  await server.start()

  return {
    async stop() {
      await server.stop()
      await db.close()
    },
  }
}

const invokedDirectly = process.argv[1] !== undefined &&
  path.resolve(process.argv[1]).startsWith(path.resolve(here, 'database'))

if (invokedDirectly) {
  const empty = process.argv.includes('--empty')

  void (async () => {
    const { stop } = await startDatabase(
      empty ? { seeded: false, port: E2E_INSTALL_DB_PORT, maxConnections: 2 } : {},
    )
    // eslint-disable-next-line no-console -- this is a process; its output is its status
    console.log(
      empty
        ? `e2e install database (empty) listening on ${E2E_INSTALL_DATABASE_URL}`
        : `e2e database listening on ${E2E_DATABASE_URL}`,
    )

    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      process.on(signal, () => {
        void stop().finally(() => process.exit(0))
      })
    }
  })()
}
