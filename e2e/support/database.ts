/**
 * A real Postgres for the browser suite, with no service to install.
 *
 * ## The gap this closes
 *
 * Since F39 the browser suite has covered **reading only**. `next dev` ran
 * against `DATA_SOURCE=fixture`, which serves sample data from memory and has
 * no writer for anything — so posting, inline moderation, private messages,
 * reputation, the UserCP and now attachments have had no browser-level proof at
 * all. Every feature since has widened that hole, and `plan-status.md` has said
 * so, feature after feature, without it moving.
 *
 * The reason it never moved is that the obvious fix — "run the e2e suite
 * against Postgres" — meant a service somebody has to install, so it would have
 * been a CI-only capability. A test path that only exists in CI is one nobody
 * runs before pushing.
 *
 * ## What this is
 *
 * PGlite is Postgres compiled to WebAssembly, and the integration suite has
 * trusted it for a hundred-odd files: the checked-in migration SQL runs
 * verbatim, partial unique indexes and conditional `UPDATE ... RETURNING`
 * included. What it could not do was serve a *separate process* — and
 * `@electric-sql/pglite-socket` puts the Postgres wire protocol in front of it,
 * so `next dev` connects with an ordinary `DATABASE_URL` and does not know the
 * difference.
 *
 * The honest limit, stated once: **PGlite is not the driver production uses.**
 * D54 is in this repository precisely because a write path PGlite accepted was
 * rejected by every real Postgres. This narrows the gap enormously and does not
 * close it, which is why `client.pg.test.ts` still exists and CI still runs a
 * job against a real server.
 *
 * ## The board it seeds is the fixture board
 *
 * Deliberately the *same* rows — `SEED_FORUM_ROWS`, `SEED_THREAD_ROWS`,
 * `SEED_POST_ROWS` — inserted into real tables. One board definition, two
 * stores. Two consequences worth having: the specs written against fixture mode
 * keep passing unchanged, and a divergence between what the fixture serves and
 * what the schema can hold becomes a startup failure here rather than a
 * mystery later.
 *
 * Run directly (`tsx e2e/support/database.ts`); `playwright.config.ts` starts it
 * as the first `webServer`, so the port is open and the data is in before the
 * app is even launched.
 */
import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'

import {
  E2E_DATABASE_URL,
  E2E_DB_PORT,
  E2E_INSTALL_DATABASE_URL,
  E2E_INSTALL_DB_PORT,
  E2E_UPLOADS_DIR,
} from './config'
import { samplePng } from './png'

import {
  SEED_FORUM_ROWS,
  SEED_MEMBER_PROFILES,
  SEED_POST_ROWS,
  SEED_THREAD_ROWS,
} from '../../apps/forum/src/server/seed-board'

const here = path.dirname(fileURLToPath(import.meta.url))
const MIGRATIONS = path.resolve(here, '../../packages/db/migrations')

/**
 * Every migration, in journal order.
 *
 * The journal rather than a glob, for the reason `pglite.fixture.ts` gives: the
 * journal is what the real runner applies, so a migration that is checked in
 * and never registered fails here exactly as it would in production.
 */
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

/**
 * The badge objects the styled group below points at.
 *
 * Fixed UUIDs rather than minted ones, because the key is also the cache-buster
 * in the served URL — a value that changed per run would make a screenshot
 * comparison and a `toHaveAttribute` both unstable for no benefit.
 */
/**
 * A second real member, so `admin` can have a rating somebody actually gave.
 *
 * The fixture board has exactly one account with an id — every other post is
 * attributed to a deleted one — and a member cannot rate themselves. Past the
 * seeded ids so it does not collide, and the sequence is advanced past it with
 * everything else.
 */
const RATER_ID = 9001

const BADGE_KEYS = {
  light: 'group/3/badge-light-11111111-1111-1111-1111-111111111111.png',
  dark: 'group/3/badge-dark-22222222-2222-2222-2222-222222222222.png',
} as const

/**
 * Put the badge bytes where the file store will find them.
 *
 * `LocalFileStore` maps a key straight onto a path under its root, so this is
 * the whole of "uploading" for a seed. Written before the app starts, because a
 * route that 404s would leave a broken image in every postbit the suite looks
 * at.
 */
async function seedBadgeFiles(): Promise<void> {
  for (const key of Object.values(BADGE_KEYS)) {
    const target = path.join(E2E_UPLOADS_DIR, key)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, samplePng(64, 16))
  }
}

/** SQL-quote a value. Test support, and the inputs are checked-in constants. */
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

/**
 * The fixture board, as rows.
 *
 * The authors come first because everything references them, and the sequences
 * are moved past the seeded ids at the end — every table uses
 * `GENERATED BY DEFAULT AS IDENTITY`, so inserting explicit ids leaves the
 * sequence at 1 and the first row the *browser* creates would collide.
 */
function seedSql(): string {
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
      /*
       * A hash nothing can match. These accounts exist to own content, not to
       * be signed into — a spec that needs a session registers through the
       * form, which is the path worth exercising anyway.
       */
      password_hash: 'x',
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
    /*
     * The denormalised last post. The fixture repository carries it as a nested
     * object and the index renders it as the "latest" column; in Postgres it is
     * six columns on `forums`, maintained on the write path. Seeding it is what
     * makes the two boards the same board — without it the index renders with
     * no latest-post link and every spec that clicks one fails for a reason
     * that has nothing to do with the code under test.
     */
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
    /*
     * F43's running aggregate. Omitted until now, so the Postgres board showed
     * "no ratings yet" on a thread the fixture board rates — the same class of
     * difference the denormalised last post above exists to avoid. A spec (or a
     * person) looking at the rating strip has to be looking at the same board.
     */
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
    /*
     * Left unrendered on purpose. F36 falls back to rendering live when the
     * stored HTML is missing or stale, and the existing specs assert on markup
     * the *live* path produced — a seeder that pre-rendered would quietly stop
     * testing that.
     */
    message_html: null,
    render_version: 0,
    is_first_post: post.isFirstPost,
    visibility: post.visibility,
    created_at: post.createdAt,
  }))

  /*
   * `admin` needs to be a real administrator for the ACP and moderation specs,
   * and group membership is a join table rather than the primary group alone.
   */
  const memberships = users.map((user) => ({
    user_id: user.id,
    group_id: user.primary_group_id,
  }))

  /*
   * Board configuration the *browser* needs, as opposed to the board's defaults.
   *
   * **`antispam.min_form_seconds` is why six specs were failing.** It defaults
   * to 3: a registration submitted sooner than that is treated as automated,
   * which is a good default for a real board and an impossible one for a
   * browser driver that fills three fields in half a second. Every spec that
   * needs a session registers through the form — the only way in, since the
   * seeded accounts carry a hash nothing can match — so the whole write half of
   * the suite was being refused with "That submission looked automated", on
   * `main`, for as long as the check has existed.
   *
   * Setting it to 0 here rather than making the specs wait three seconds each:
   * the timing floor has its own unit tests in `@meith/antispam`, this suite is
   * about whether a board can be read and written without JavaScript, and six
   * artificial three-second waits is a slower suite that proves nothing extra.
   *
   * The value is JSON-encoded, because the settings registry owns parsing per
   * type and the column is text — see `packages/db/src/schema/platform.ts`.
   */
  const settings = [
    { key: 'antispam.min_form_seconds', value: '0', group_key: 'antispam' },
    /*
     * The post-count floor, off. It defaults to 5, and every spec that needs a
     * session registers through the form — so its member has posted nothing and
     * is below it, and the Thanks button would be correctly refused for a
     * reason that has nothing to do with what is being tested. The floor is a
     * spam defence with its own unit tests in `@meith/reputation`; making six
     * specs post five times each to clear it would be a slower suite proving
     * nothing extra.
     *
     * `comment_required` and `allow_negative` are left at their defaults — off
     * and off — because that *is* the board worth pinning in a browser: the one
     * where the Thanks button is the whole rating control.
     */
    { key: 'reputation.min_posts_to_give', value: '0', group_key: 'reputation' },
    /*
     * Registration completes without a confirmation link.
     *
     * This agrees with the registry default, and is stated anyway. Every spec
     * that needs a session registers through the form, so a board that asked
     * for a confirmation link would strand the whole suite at
     * `awaiting_activation` with no way to log in — `MAIL_DRIVER` here is
     * `log`, which sends nothing. That is not a dependency to leave implicit in
     * a default: it broke every sign-up spec once already, when the setting
     * gained a reader and the default was still `email`.
     *
     * Activation itself is covered where its rules live — the domain suite, the
     * adapter suite and `auth-actions.test.ts`. Teaching six specs to fish a
     * token out of the log would make each of them a test of activation rather
     * than of what it is named for.
     *
     * Stored bare: `serialise` writes a string setting verbatim, not as JSON.
     */
    { key: 'registration.method', value: 'none', group_key: 'registration' },
    /*
     * The search flood interval, off. It defaults to 30 seconds — the right
     * default for a board and an unworkable one for a spec, which runs several
     * searches in a row and would otherwise be told to wait by four of them.
     * The interval has its own coverage in `search-store.test.ts`, where it can
     * be tested without spending thirty seconds a case.
     */
    { key: 'search.flood_seconds', value: '0', group_key: 'search' },
  ]

  /*
   * A styled usergroup, so the browser suite has something to see.
   *
   * `admin` is the only seeded member of group 3, and every post in thread 4 is
   * theirs — so one thread page carries a coloured name, a group title, a badge
   * and a reputation, which is the whole surface in one screenshot.
   *
   * The colours are the *board's*, not a theme's: the light one is a dark green
   * and the dark one a pale green, chosen so both clear WCAG AA against their
   * own background. The accessibility spec runs axe over these pages, so a
   * decorative choice here would fail a real check rather than a cosmetic one.
   *
   * The badge keys match the shape `group-badge.ts` writes and re-validates on
   * the way out, including the group id in the path — a key naming a different
   * group is refused by the route, and the file it points at is written to the
   * upload directory by `seedBadgeFiles` below.
   */
  const styledGroup = [
    `update usergroups set
       name_color_light = 'oklch(0.45 0.13 155)',
       name_color_dark = 'oklch(0.85 0.14 155)',
       badge_image_light = ${literal(BADGE_KEYS.light)},
       badge_image_dark = ${literal(BADGE_KEYS.dark)}
     where id = 3;`,
    /*
     * A reputation the postbit can show — as a **row**, not as a number written
     * into the column.
     *
     * `users.reputation` is derived: F62 recomputes it from the live ratings
     * inside every transaction that changes them, precisely so that a
     * withdrawal cannot leave the total drifting. Writing the column with no
     * rows behind it is the corruption that design exists to repair, and it
     * repairs it — the first press of any Thanks button recounts the total to
     * what the rows actually say and the seeded number vanishes. That is the
     * feature working, and it made a browser test fail in a way that looked
     * like the button was broken.
     *
     * So the seed states the truth instead: one member, one rating, and a
     * column that agrees with it.
     */
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

  return [
    insert('users', users),
    insert('user_group_memberships', memberships),
    insert('settings', settings),
    ...styledGroup,
    insert('forums', forums),
    insert('threads', threads),
    insert('posts', posts),
    /*
     * **No `search_vector` here, deliberately.**
     *
     * A bulk insert leaves F72's index unwritten, and this seed is a bulk
     * insert — so the board it produces is exactly the board an operator gets
     * after an import: correct in every table, and answering every search with
     * nothing. Writing the vectors here would have hidden that, and would have
     * meant a second copy of the document rule living in a fixture, free to go
     * on agreeing with itself after the real one moved.
     *
     * `search.reindex` is what fills it, on the tick, and `search-no-js.spec.ts`
     * drives that tick before it searches — so the vectors the browser suite
     * asserts on are written by the board's own code, and the task that makes an
     * imported board searchable is covered by the same wait.
     */
    /* Past every seeded id, so the first row a browser creates does not collide. */
    "select setval(pg_get_serial_sequence('users', 'id'), (select max(id) from users));",
    "select setval(pg_get_serial_sequence('forums', 'id'), (select max(id) from forums));",
    "select setval(pg_get_serial_sequence('threads', 'id'), (select max(id) from threads));",
    "select setval(pg_get_serial_sequence('posts', 'id'), (select max(id) from posts));",
  ]
    .filter((statement) => statement !== '')
    .join('\n')
}

export interface DatabaseOptions {
  /**
   * `false` starts a database with **no schema and no rows** — which is what
   * `/install` requires and what nothing here could produce before.
   *
   * The installer's first step applies the migrations itself, and its preflight
   * refuses to offer a form when the database already holds accounts. So the
   * board seeded above is precisely the one thing it cannot run against, and
   * "an empty database" is a fixture rather than an omission.
   */
  readonly seeded?: boolean
  readonly port?: number
  /**
   * How many sockets the server accepts. One everywhere except the installer.
   *
   * The installer needs two because **`runMigrations()` opens its own
   * connection** and must: it takes a session-level advisory lock so concurrent
   * deploys serialise, which is only meaningful on a single dedicated session,
   * and it prefers `DIRECT_DATABASE_URL` for the same reason. So while the app's
   * pool holds one socket, the migrator dials a second — and against a
   * one-connection server that is `read ECONNRESET` reported as a failed
   * "Apply migrations" step.
   *
   * Two is safe here where it would not be in general: the unnamed-statement
   * clobbering described below needs two clients issuing extended-protocol
   * queries *at the same time*, and the install spec is one worker doing one
   * thing at a time — the migrator runs to completion and closes its connection
   * before the next step queries anything.
   */
  readonly maxConnections?: number
}

export async function startDatabase(
  options: DatabaseOptions = {},
): Promise<{ stop: () => Promise<void> }> {
  const seeded = options.seeded ?? true

  const db = await PGlite.create()
  if (seeded) {
    await db.exec(migrationSql())
    await db.exec(seedSql())
    await seedBadgeFiles()
  }

  const server = new PGLiteSocketServer({
    db,
    port: options.port ?? E2E_DB_PORT,
    host: '127.0.0.1',
    /*
     * **One backend, therefore one connection.** This is not a tuning choice.
     *
     * A real Postgres gives every connection its own backend process, and with
     * it its own *unnamed prepared statement* — which is what `prepare: false`
     * (the setting `client.ts` uses, and must) makes every query go through.
     * PGlite is a single backend behind however many sockets, so two
     * connections using the unnamed statement clobber each other's parameter
     * lists. The error that comes back is
     * `bind message supplies 1 parameters, but prepared statement "" requires 2`
     * — which looks like a driver bug and is really two clients sharing one
     * backend.
     *
     * A second connection is therefore *queued* rather than served in parallel,
     * which is fine: the suite runs one worker, and `DATABASE_POOL_MAX=1` in
     * `playwright.config.ts` means the app asks for one anyway.
     */
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

/* Run as a process: start, and stay up until asked to stop. */
const invokedDirectly = process.argv[1] !== undefined &&
  path.resolve(process.argv[1]).startsWith(path.resolve(here, 'database'))

if (invokedDirectly) {
  /*
   * `--empty` starts the installer's database: same PGlite, no migrations, no
   * rows. A flag rather than a second file because the two differ by three
   * lines, and a copy would be a second place for the socket settings below —
   * every one of which is load-bearing and none of which is obvious.
   */
  const empty = process.argv.includes('--empty')

  /*
   * Not top-level `await`: the workspace root is CommonJS, so `tsx` transforms
   * this file to CJS and top-level await does not compile. An IIFE costs
   * nothing and keeps the file runnable both ways.
   */
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
