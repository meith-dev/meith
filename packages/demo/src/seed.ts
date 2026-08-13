import { hashPassword } from '@meith/accounts'
import { logger } from '@meith/core'
import {
  PostgresAdminRepository,
  PostgresContentAdminRepository,
  PostgresForumAdminRepository,
  PostgresForumRepository,
  PostgresGroupAdminRepository,
  PostgresMessageRepository,
  PostgresPollRepository,
  PostgresReportRepository,
  PostgresReputationRepository,
  PostgresSettingsRepository,
  PostgresThreadToolsRepository,
  PostgresThreadWriteRepository,
  SEED_GROUP_KEY,
  applyPluginMigration,
  markInstalled,
  recordVersion,
  resultRows,
  type Database,
} from '@meith/db'
import { quoteBlock, renderMarkdown, vocabularyOptions } from '@meith/markdown'
import type { PluginDefinition } from '@meith/plugin-kit'
import { threadSlug } from '@meith/threads'
import { sql } from 'drizzle-orm'

import { DEMO_ACCOUNTS, type DemoAccount, type DemoGroupKey } from './accounts'
import { DUES_PLUGIN_KEY, SUPPORTERS_GROUP_KEY, ensureSupportersGroup, seedDuesDemoBoard } from './dues'
import {
  DEMO_FORUMS,
  DEMO_MESSAGES,
  DEMO_PREFIXES,
  DEMO_REPORTS,
  DEMO_THANKS,
  DEMO_THREADS,
  type DemoForumAccess,
  type DemoReply,
  type DemoThread,
} from './content'

const DEMO_VERSION = '0.1.0-demo'

const GROUP_KEY: Record<DemoGroupKey, string> = {
  administrators: SEED_GROUP_KEY.administrators,
  superModerators: SEED_GROUP_KEY.superModerators,
  moderators: SEED_GROUP_KEY.moderators,
  registered: SEED_GROUP_KEY.registered,
  awaitingActivation: SEED_GROUP_KEY.awaitingActivation,
}

/**
 * The staff colours, which a board of your own picks for itself on the groups
 * screen. Every value is set twice because a name has to be readable on both
 * schemes: the light ones are dark enough to read on paper-white, the dark ones
 * bright enough to read at midnight, and the pair keeps the same hue so the
 * hierarchy is the same hierarchy in both.
 */
const GROUP_COLOUR: Readonly<
  Record<string, { readonly light: string; readonly dark: string }>
> = {
  [SEED_GROUP_KEY.administrators]: { light: '#b91c1c', dark: '#f87171' },
  [SEED_GROUP_KEY.superModerators]: { light: '#1e3a8a', dark: '#60a5fa' },
  [SEED_GROUP_KEY.moderators]: { light: '#0284c7', dark: '#7dd3fc' },
}

/**
 * A closed section is a permission override per group, which is what an
 * administrator writes on the permissions screen — there is no separate private
 * flag to find. The rows go on the category and on every forum under it, so the
 * screen answers "who can read this?" on whichever one you happen to open.
 */
const CLOSED_TO: Readonly<Record<DemoForumAccess, readonly string[]>> = {
  staff: [
    SEED_GROUP_KEY.guests,
    SEED_GROUP_KEY.registered,
    SEED_GROUP_KEY.awaitingActivation,
    SEED_GROUP_KEY.banned,
    SUPPORTERS_GROUP_KEY,
  ],
  supporters: [
    SEED_GROUP_KEY.guests,
    SEED_GROUP_KEY.registered,
    SEED_GROUP_KEY.awaitingActivation,
    SEED_GROUP_KEY.banned,
  ],
}

/**
 * Who is written in as allowed, rather than left to inherit it.
 *
 * The staff would see both sections anyway — an administrator bypasses the
 * matrix entirely and the other two groups are not denied — but "an
 * administrator can see the supporters' club" should be a row an administrator
 * can read on the permissions screen and not a rule they have to know. It also
 * survives somebody using the demo the way a demo invites: rewrite the
 * registered group's defaults, and the staff sections stay staff sections.
 */
const OPEN_TO: Readonly<Record<DemoForumAccess, readonly string[]>> = {
  staff: [
    SEED_GROUP_KEY.administrators,
    SEED_GROUP_KEY.superModerators,
    SEED_GROUP_KEY.moderators,
  ],
  supporters: [
    SEED_GROUP_KEY.administrators,
    SEED_GROUP_KEY.superModerators,
    SEED_GROUP_KEY.moderators,
    SUPPORTERS_GROUP_KEY,
  ],
}

const CLOSED = {
  canView: false,
  canViewThreads: false,
  canViewOthersThreads: false,
  canSearch: false,
  canPostThreads: false,
  canPostReplies: false,
} as const

const OPEN = {
  canView: true,
  canViewThreads: true,
  canViewOthersThreads: true,
  canSearch: true,
  canPostThreads: true,
  canPostReplies: true,
} as const

/**
 * Argon2id at the shipped policy costs ~50ms per hash, and only three accounts
 * have a password at all — but the reset runs on a timer with a live board
 * waiting on it, so the demo hashes at the cheapest setting the verifier still
 * accepts. These are published passwords printed in a banner. There is nothing
 * to protect.
 */
const DEMO_HASH_POLICY = { memorySize: 8192, iterations: 1, parallelism: 1 } as const

export interface SeedSummary {
  readonly forums: number
  readonly threads: number
  readonly posts: number
  readonly members: number
  readonly plugins: readonly string[]
}

export interface SeedOptions {
  readonly plugins?: readonly PluginDefinition[] | undefined
}

interface Placed {
  readonly thread: DemoThread
  readonly threadId: number
  /** Post ids in reading order: opening post first. */
  readonly postIds: readonly number[]
}

/**
 * Writes the demo board into an empty, migrated database.
 *
 * Everything goes through the same repositories a member's browser does, which
 * is not ceremony: those writes are where counters are incremented, markdown is
 * rendered and the search vector is built. A seed that reached past them into
 * `insert` would produce a board that looks right and cannot be searched, with
 * member post counts of zero — the three bugs every hand-written seed has.
 */
export async function seedDemoBoard(
  db: Database,
  now: Date = new Date(),
  options: SeedOptions = {},
): Promise<SeedSummary> {
  const log = logger({ module: 'demo' })

  const userIds = await seedAccounts(db, now)
  const groupIds = await seedGroupIdentity(db)
  const forums = await seedForums(db)
  const forumIds = new Map([...forums].map(([key, forum]) => [key, forum.id]))

  await seedForumAccess(db, forums, groupIds)
  const prefixIds = await seedPrefixes(db, forums)

  const placed = await seedThreads(db, { userIds, forumIds, prefixIds, now })

  await seedPolls(db, placed, userIds)
  await seedThanks(db, placed, userIds, now)
  await seedMessages(db, userIds, now)
  await seedReports(db, placed, userIds, now)
  await seedSettings(db)

  const plugins = await seedPlugins(db, options.plugins ?? [], userIds, now)

  await markInstalled(db, DEMO_VERSION)

  const summary: SeedSummary = {
    members: userIds.size,
    forums: forumIds.size,
    threads: placed.length,
    posts: placed.reduce((total, entry) => total + entry.postIds.length, 0),
    plugins,
  }

  log.info(summary, 'demo board seeded')
  return summary
}

async function seedAccounts(db: Database, now: Date): Promise<ReadonlyMap<string, number>> {
  const admin = new PostgresAdminRepository(db)
  const groups = new Map<DemoGroupKey, number>()

  for (const key of Object.keys(GROUP_KEY) as DemoGroupKey[]) {
    const group = await admin.findGroup(GROUP_KEY[key])
    if (group === null) {
      throw new Error(
        `No usergroup has the key "${GROUP_KEY[key]}". The seed migration did not run, ` +
          'so there is no group ladder to put demo members on.',
      )
    }
    groups.set(key, group.id)
  }

  const ids = new Map<string, number>()

  for (const account of DEMO_ACCOUNTS) {
    const createdAt = daysBefore(now, account.joinedDaysAgo)
    const hash =
      account.password === null ? null : await hashPassword(account.password, DEMO_HASH_POLICY)

    const rows = resultRows(
      await db.execute(sql`
        insert into users
          (username, username_lower, email, email_lower, password_hash, password_algo,
           password_changed_at, primary_group_id, state, location, website, bio,
           last_active_at, email_verified_at, created_at, updated_at)
        values
          (${account.username}, ${account.username.toLowerCase()},
           ${account.email}, ${account.email.toLowerCase()},
           ${hash}, ${hash === null ? null : 'argon2id'}, ${createdAt},
           ${groups.get(account.group)!},
           ${account.group === 'awaitingActivation' ? 'awaiting_activation' : 'active'},
           ${account.location}, ${account.website}, ${account.bio},
           ${lastActive(now, account)}, ${createdAt}, ${createdAt}, ${createdAt})
        returning id
      `),
    ) as Array<{ id: number }>

    ids.set(account.key, Number(rows[0]!.id))
  }

  return ids
}

/**
 * Recent enough that the member list does not read as a graveyard, but never
 * newer than the account itself — a member last seen before they joined is the
 * kind of detail that quietly tells a visitor the board is fake.
 */
function lastActive(now: Date, account: DemoAccount): Date {
  const days = Math.min(account.joinedDaysAgo, account.joinedDaysAgo < 30 ? 1 : 9)
  return daysBefore(now, days)
}

/**
 * Paints the staff groups and makes the group the supporters-only forum is
 * opened to, whether or not the Dues plugin is going to be installed after it.
 *
 * The colours are written through the same repository the groups screen writes
 * through, so a visitor can change them and see the change everywhere a name
 * appears — the value is a class the app emits into the stylesheet rather than
 * an inline colour, because a name needs one answer for light and another for
 * dark and a `style` attribute only holds one.
 */
async function seedGroupIdentity(db: Database): Promise<ReadonlyMap<string, number>> {
  const groups = new PostgresGroupAdminRepository(db)
  await ensureSupportersGroup(db)

  const ids = new Map<string, number>()

  for (const group of await groups.list()) {
    ids.set(group.key, group.id)

    const colour = GROUP_COLOUR[group.key]
    if (colour === undefined) continue

    await groups.updateIdentity(group.id, {
      title: group.title,
      description: group.description,
      displayOrder: group.displayOrder,
      isStaffGroup: group.isStaffGroup,
      pluginGrantable: group.pluginGrantable,
      badgeToken: group.badgeToken,
      nameColorLight: colour.light,
      nameColorDark: colour.dark,
    })
  }

  return ids
}

interface SeededForum {
  readonly id: number
  /** The materialised path, which is how a prefix is scoped to a branch. */
  readonly path: string
}

async function seedForums(db: Database): Promise<ReadonlyMap<string, SeededForum>> {
  const forums = new PostgresForumRepository(db)
  const created = new Map<string, SeededForum>()

  for (const [index, forum] of DEMO_FORUMS.entries()) {
    const parentId = forum.parent === null ? null : (created.get(forum.parent)?.id ?? null)
    if (forum.parent !== null && parentId === null) {
      throw new Error(`Demo forum "${forum.key}" names a parent "${forum.parent}" declared after it.`)
    }

    const row = await forums.create({
      type: forum.type,
      title: forum.title,
      slug: forum.slug,
      parentId,
      displayOrder: index,
      ...(forum.description === undefined ? {} : { description: forum.description }),
    })
    created.set(forum.key, { id: row.id, path: row.path })
  }

  return created
}

/** Closes the two sections that are not for everybody, one group row at a time. */
async function seedForumAccess(
  db: Database,
  forums: ReadonlyMap<string, SeededForum>,
  groupIds: ReadonlyMap<string, number>,
): Promise<void> {
  const admin = new PostgresForumAdminRepository(db)

  const idOf = (groupKey: string, forumKey: string): number => {
    const id = groupIds.get(groupKey)
    if (id === undefined) {
      throw new Error(`"${forumKey}" names the "${groupKey}" group, which does not exist.`)
    }
    return id
  }

  for (const forum of DEMO_FORUMS) {
    if (forum.access === undefined) continue
    const seeded = forums.get(forum.key)!

    for (const groupKey of CLOSED_TO[forum.access]) {
      await admin.saveOverrides(seeded.id, idOf(groupKey, forum.key), { ...CLOSED })
    }
    for (const groupKey of OPEN_TO[forum.access]) {
      await admin.saveOverrides(seeded.id, idOf(groupKey, forum.key), { ...OPEN })
    }
  }
}

async function seedPrefixes(
  db: Database,
  forums: ReadonlyMap<string, SeededForum>,
): Promise<ReadonlyMap<string, number>> {
  const content = new PostgresContentAdminRepository(db)
  const ids = new Map<string, number>()

  for (const [index, prefix] of DEMO_PREFIXES.entries()) {
    const scope = prefix.scope === null ? null : forums.get(prefix.scope)
    if (prefix.scope !== null && scope === undefined) {
      throw new Error(`Demo prefix "${prefix.key}" is scoped to "${prefix.scope}", which is not a forum.`)
    }

    ids.set(
      prefix.key,
      await content.createPrefix({
        label: prefix.label,
        token: prefix.token,
        displayOrder: index,
        forumPathPrefix: scope?.path ?? null,
      }),
    )
  }

  return ids
}

async function seedThreads(
  db: Database,
  input: {
    readonly userIds: ReadonlyMap<string, number>
    readonly forumIds: ReadonlyMap<string, number>
    readonly prefixIds: ReadonlyMap<string, number>
    readonly now: Date
  },
): Promise<readonly Placed[]> {
  const writes = new PostgresThreadWriteRepository(db)
  const tools = new PostgresThreadToolsRepository(db)
  const placed: Placed[] = []

  // Oldest first, so `last_post_at` on every forum ends up telling the truth
  // about which conversation is actually the freshest.
  const ordered = [...DEMO_THREADS].sort((a, b) => b.daysAgo - a.daysAgo)

  for (const thread of ordered) {
    const author = requireUser(input.userIds, thread.author)
    const forumId = input.forumIds.get(thread.forum)
    if (forumId === undefined) {
      throw new Error(`Demo thread "${thread.title}" is in forum "${thread.forum}", which is not declared.`)
    }

    const openedAt = daysBefore(input.now, thread.daysAgo)
    const slug = threadSlug(thread.title)
    const prefixId = thread.prefix === undefined ? null : (input.prefixIds.get(thread.prefix) ?? null)
    if (thread.prefix !== undefined && prefixId === null) {
      throw new Error(`Demo thread "${thread.title}" carries a prefix "${thread.prefix}" that is not declared.`)
    }

    const created = await writes.create({
      forumId,
      title: thread.title,
      slug,
      message: thread.message,
      prefixId,
      authorUserId: author.id,
      authorUsername: author.username,
      visibility: thread.visibility ?? 'visible',
      subscribe: false,
      createdAt: openedAt,
    })

    const postIds = [created.postId]

    for (const reply of thread.replies ?? []) {
      const replier = requireUser(input.userIds, reply.author)
      const { postId } = await writes.createReply({
        threadId: created.threadId,
        forumId,
        threadTitle: thread.title,
        message: quoting(thread, reply, {
          userIds: input.userIds,
          threadId: created.threadId,
          slug,
          postIds,
        }),
        authorUserId: replier.id,
        authorUsername: replier.username,
        visibility: reply.visibility ?? 'visible',
        subscribe: false,
        createdAt: hoursAfter(openedAt, reply.hoursAfter),
      })
      postIds.push(postId)
    }

    // Sticky and locked go through the moderation tools rather than an update,
    // so the admin log has the entries a real board would have.
    if (thread.sticky === true) {
      await tools.setSticky({
        threadId: created.threadId,
        sticky: true,
        actorUserId: author.id,
        at: openedAt,
      })
    }
    if (thread.locked === true) {
      await tools.setLocked({
        threadId: created.threadId,
        locked: true,
        actorUserId: author.id,
        at: openedAt,
      })
    }

    placed.push({ thread, threadId: created.threadId, postIds })
  }

  return placed
}

function quoting(
  thread: DemoThread,
  reply: DemoReply,
  target: {
    readonly userIds: ReadonlyMap<string, number>
    readonly threadId: number
    readonly slug: string
    readonly postIds: readonly number[]
  },
): string {
  if (reply.quotes === undefined) return reply.message

  const postId = target.postIds[reply.quotes]
  const quoted =
    reply.quotes === 0 ? thread.message : (thread.replies ?? [])[reply.quotes - 1]?.message
  const author =
    reply.quotes === 0 ? thread.author : (thread.replies ?? [])[reply.quotes - 1]?.author

  if (postId === undefined || quoted === undefined || author === undefined) {
    throw new Error(
      `A reply in "${thread.title}" quotes post ${reply.quotes}, which is not above it.`,
    )
  }

  const block = quoteBlock({
    author: requireUser(target.userIds, author).username,
    markdown: quoted,
    sourceHref: `/thread/${target.threadId}-${target.slug}?post=${postId}`,
  })

  return `${block}\n\n${reply.message}`
}

async function seedPolls(
  db: Database,
  placed: readonly Placed[],
  userIds: ReadonlyMap<string, number>,
): Promise<void> {
  const polls = new PostgresPollRepository(db)

  for (const entry of placed) {
    const poll = entry.thread.poll
    if (poll === undefined) continue

    await polls.create(entry.threadId, {
      question: poll.question,
      options: poll.options.map((option) => option.label),
      closesAt: poll.closesInDays === null ? null : daysAfter(new Date(), poll.closesInDays),
    })

    const found = await polls.find(entry.threadId, null)
    if (found === null) continue

    for (const [index, option] of poll.options.entries()) {
      const optionId = found.options[index]?.id
      if (optionId === undefined) continue

      for (const voter of option.voters) {
        await polls.vote({
          pollId: found.id,
          optionId,
          userId: requireUser(userIds, voter).id,
        })
      }
    }
  }
}

async function seedThanks(
  db: Database,
  placed: readonly Placed[],
  userIds: ReadonlyMap<string, number>,
  now: Date,
): Promise<void> {
  const reputation = new PostgresReputationRepository(db)

  for (const thanks of DEMO_THANKS) {
    const entry = placed.find((candidate) => candidate.thread.title === thanks.threadTitle)
    if (entry === undefined) {
      throw new Error(`Demo reputation names a thread "${thanks.threadTitle}" that does not exist.`)
    }

    const postId = entry.postIds[thanks.postIndex]
    if (postId === undefined) {
      throw new Error(
        `Demo reputation names post ${thanks.postIndex} of "${thanks.threadTitle}", which has ` +
          `${entry.postIds.length}.`,
      )
    }

    const recipient = postAuthor(entry, thanks.postIndex, userIds)

    for (const [index, giver] of thanks.from.entries()) {
      const from = requireUser(userIds, giver)
      if (from.id === recipient) continue

      await reputation.give({
        userId: recipient,
        givenByUserId: from.id,
        postId,
        points: 1,
        comment: '',
        // The daily cap is a member-facing rule; the seed is not a member, and
        // spreading synthetic thanks across synthetic days to satisfy it would
        // be pretending. Waived here and nowhere else.
        maxPerDay: 0,
        at: hoursAfter(daysBefore(now, entry.thread.daysAgo), index + 1),
      })
    }
  }
}

function postAuthor(
  entry: Placed,
  postIndex: number,
  userIds: ReadonlyMap<string, number>,
): number {
  const key =
    postIndex === 0
      ? entry.thread.author
      : (entry.thread.replies ?? [])[postIndex - 1]?.author
  if (key === undefined) {
    throw new Error(`Post ${postIndex} of "${entry.thread.title}" has no author.`)
  }
  return requireUser(userIds, key).id
}

async function seedMessages(
  db: Database,
  userIds: ReadonlyMap<string, number>,
  now: Date,
): Promise<void> {
  const messages = new PostgresMessageRepository(db)

  for (const message of DEMO_MESSAGES) {
    const author = requireUser(userIds, message.from)
    const body = renderMarkdown(message.message, vocabularyOptions(undefined))

    await messages.send({
      authorUserId: author.id,
      authorUsername: author.username,
      subject: message.subject,
      message: message.message,
      messageHtml: body.html,
      renderVersion: body.version,
      vocabVersion: 0,
      replyToId: null,
      receiptRequested: false,
      recipients: message.to.map((key) => ({
        userId: requireUser(userIds, key).id,
        bcc: false,
      })),
      at: daysBefore(now, message.daysAgo),
    })
  }
}

async function seedReports(
  db: Database,
  placed: readonly Placed[],
  userIds: ReadonlyMap<string, number>,
  now: Date,
): Promise<void> {
  const reports = new PostgresReportRepository(db)

  for (const report of DEMO_REPORTS) {
    const entry = placed.find((candidate) => candidate.thread.title === report.threadTitle)
    if (entry === undefined) {
      throw new Error(`Demo report names a thread "${report.threadTitle}" that does not exist.`)
    }

    const postId = entry.postIds[report.postIndex]
    if (postId === undefined) {
      throw new Error(`Demo report names a post index that "${report.threadTitle}" does not have.`)
    }

    const reporter = requireUser(userIds, report.reporter)
    const target = await reports.resolveTarget('post', postId, reporter.id)
    if (target === null) {
      throw new Error(`Demo report target post ${postId} could not be resolved.`)
    }

    await reports.open({
      target,
      reporterUserId: reporter.id,
      reason: report.reason,
      at: hoursAfter(now, -report.hoursAgo),
    })
  }
}

async function seedPlugins(
  db: Database,
  definitions: readonly PluginDefinition[],
  userIds: ReadonlyMap<string, number>,
  now: Date,
): Promise<readonly string[]> {
  const furnished: string[] = []

  for (const definition of definitions) {
    for (const migration of definition.migrations ?? []) {
      await applyPluginMigration(db, definition.key, migration.id, migration.statements)
    }
    await recordVersion(db, `plugin:${definition.key}`, definition.version)

    if (definition.key === DUES_PLUGIN_KEY) {
      await seedDuesDemoBoard(db, userIds, now)
      furnished.push(definition.key)
    }
  }

  return furnished
}

async function seedSettings(db: Database): Promise<void> {
  await new PostgresSettingsRepository(db).save(
    new Map([
      ['board.name', 'The Meitheal'],
      [
        'board.description',
        'A club, its committee, its juvenile section and its Tuesday night crew, on one board. ' +
          'Everything here resets on a timer.',
      ],
    ]),
  )
}

interface DemoUser {
  readonly id: number
  readonly username: string
}

function requireUser(userIds: ReadonlyMap<string, number>, key: string): DemoUser {
  const id = userIds.get(key)
  if (id === undefined) {
    throw new Error(`The demo content refers to an author "${key}" that no account defines.`)
  }
  const account = DEMO_ACCOUNTS.find((candidate) => candidate.key === key)!
  return { id, username: account.username }
}

const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000

function daysBefore(now: Date, days: number): Date {
  return new Date(now.getTime() - days * DAY_MS)
}

function daysAfter(now: Date, days: number): Date {
  return new Date(now.getTime() + days * DAY_MS)
}

function hoursAfter(from: Date, hours: number): Date {
  return new Date(from.getTime() + hours * HOUR_MS)
}
