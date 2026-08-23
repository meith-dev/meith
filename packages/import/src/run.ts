import type { ImportSource, Page } from './source'
import type {
  ImportedAttachment,
  ImportedAvatar,
  ImportedBan,
  ImportedForum,
  ImportedPoll,
  ImportedPollVote,
  ImportedPost,
  ImportedPrivateMessage,
  ImportedReputation,
  ImportedSubscription,
  ImportedThread,
  ImportedUser,
  ImportedUserRelation,
  ImportedWarning,
} from './types'

export const KINDS = [
  'users',
  'forums',
  'threads',
  'posts',
  'avatars',
  'attachments',
  'polls',
  'pollVotes',
  'privateMessages',
  'threadSubscriptions',
  'forumSubscriptions',
  'reputation',
  'warnings',
  'bans',
  'userRelations',
] as const
export type Kind = (typeof KINDS)[number]

export type Cursors = Readonly<Record<Kind, number>>

export const NO_PROGRESS: Cursors = Object.fromEntries(KINDS.map((kind) => [kind, 0])) as Record<
  Kind,
  number
>

export interface ImportSink {
  putUsers(rows: readonly ImportedUser[]): Promise<WriteResult>
  putForums(rows: readonly ImportedForum[]): Promise<WriteResult>
  putThreads(rows: readonly ImportedThread[]): Promise<WriteResult>
  putPosts(rows: readonly ImportedPost[]): Promise<WriteResult>
  putAvatars(rows: readonly ImportedAvatar[]): Promise<WriteResult>
  putAttachments(rows: readonly ImportedAttachment[]): Promise<WriteResult>
  putPolls(rows: readonly ImportedPoll[]): Promise<WriteResult>
  putPollVotes(rows: readonly ImportedPollVote[]): Promise<WriteResult>
  putPrivateMessages(rows: readonly ImportedPrivateMessage[]): Promise<WriteResult>
  putThreadSubscriptions(rows: readonly ImportedSubscription[]): Promise<WriteResult>
  putForumSubscriptions(rows: readonly ImportedSubscription[]): Promise<WriteResult>
  putReputation(rows: readonly ImportedReputation[]): Promise<WriteResult>
  putWarnings(rows: readonly ImportedWarning[]): Promise<WriteResult>
  putBans(rows: readonly ImportedBan[]): Promise<WriteResult>
  putUserRelations(rows: readonly ImportedUserRelation[]): Promise<WriteResult>
}

export interface WriteResult {
  readonly inserted: number
  readonly updated: number
  readonly skipped: readonly { readonly legacyId: number; readonly reason: string }[]
}

export interface KindReport {
  readonly read: number
  readonly inserted: number
  readonly updated: number
  readonly skipped: readonly { readonly legacyId: number; readonly reason: string }[]
}

export interface ImportReport {
  readonly kinds: Readonly<Record<Kind, KindReport>>
  readonly cursors: Cursors
  readonly finished: boolean
  readonly readThisRun: number
}

export interface RunOptions {
  readonly source: ImportSource
  readonly sink: ImportSink
  readonly pageSize?: number | undefined
  readonly budget?: number | undefined
  readonly from?: Partial<Cursors> | undefined
}

const emptyKind = (): KindReport => ({ read: 0, inserted: 0, updated: 0, skipped: [] })

export async function runImport(options: RunOptions): Promise<ImportReport> {
  const pageSize = options.pageSize ?? 200
  const budget = options.budget ?? 2000
  const cursors: Record<Kind, number> = { ...NO_PROGRESS, ...options.from }

  const kinds = Object.fromEntries(KINDS.map((kind) => [kind, emptyKind()])) as Record<
    Kind,
    KindReport
  >

  let readThisRun = 0
  const exhausted = new Set<Kind>()

  for (const kind of KINDS) {
    while (readThisRun < budget) {
      const limit = Math.min(pageSize, budget - readThisRun)
      const outcome = await importPage(kind, options, cursors[kind], limit)

      kinds[kind] = merge(kinds[kind], outcome.report)
      readThisRun += outcome.report.read

      if (outcome.nextCursor === null) {
        exhausted.add(kind)
        break
      }
      cursors[kind] = outcome.nextCursor
    }
  }

  return {
    kinds,
    cursors,
    finished: KINDS.every((kind) => exhausted.has(kind)),
    readThisRun,
  }
}

function merge(a: KindReport, b: KindReport): KindReport {
  return {
    read: a.read + b.read,
    inserted: a.inserted + b.inserted,
    updated: a.updated + b.updated,
    skipped: [...a.skipped, ...b.skipped],
  }
}

async function importPage(
  kind: Kind,
  options: RunOptions,
  after: number,
  limit: number,
): Promise<{ report: KindReport; nextCursor: number | null }> {
  const { source, sink } = options

  const write = async <T>(
    page: Page<T>,
    put: (rows: readonly T[]) => Promise<WriteResult>,
  ): Promise<{ report: KindReport; nextCursor: number | null }> => {
    if (page.rows.length === 0) return { report: emptyKind(), nextCursor: page.nextCursor }
    const written = await put(page.rows)
    return { report: report(page.rows.length, written), nextCursor: page.nextCursor }
  }

  switch (kind) {
    case 'users':
      return write(await source.users(after, limit), sink.putUsers.bind(sink))
    case 'forums':
      return write(await source.forums(after, limit), sink.putForums.bind(sink))
    case 'threads':
      return write(await source.threads(after, limit), sink.putThreads.bind(sink))
    case 'posts':
      return write(await source.posts(after, limit), sink.putPosts.bind(sink))
    case 'avatars':
      return write(await source.avatars(after, limit), sink.putAvatars.bind(sink))
    case 'attachments':
      return write(await source.attachments(after, limit), sink.putAttachments.bind(sink))
    case 'polls':
      return write(await source.polls(after, limit), sink.putPolls.bind(sink))
    case 'pollVotes':
      return write(await source.pollVotes(after, limit), sink.putPollVotes.bind(sink))
    case 'privateMessages':
      return write(await source.privateMessages(after, limit), sink.putPrivateMessages.bind(sink))
    case 'threadSubscriptions':
      return write(
        await source.threadSubscriptions(after, limit),
        sink.putThreadSubscriptions.bind(sink),
      )
    case 'forumSubscriptions':
      return write(
        await source.forumSubscriptions(after, limit),
        sink.putForumSubscriptions.bind(sink),
      )
    case 'reputation':
      return write(await source.reputation(after, limit), sink.putReputation.bind(sink))
    case 'warnings':
      return write(await source.warnings(after, limit), sink.putWarnings.bind(sink))
    case 'bans':
      return write(await source.bans(after, limit), sink.putBans.bind(sink))
    case 'userRelations':
      return write(await source.userRelations(after, limit), sink.putUserRelations.bind(sink))
  }
}

function report(read: number, written: WriteResult): KindReport {
  return { read, inserted: written.inserted, updated: written.updated, skipped: written.skipped }
}

export interface CounterComparison {
  readonly legacyId: number
  readonly field: string
  readonly claimed: number
  readonly actual: number
}

export function compareCounters(input: {
  readonly forums: readonly ImportedForum[]
  readonly threads: readonly ImportedThread[]
  readonly posts: readonly ImportedPost[]
  readonly claimedForumTotals: Readonly<Record<number, { threads: number; posts: number }>>
}): readonly CounterComparison[] {
  const differences: CounterComparison[] = []

  const visibleThreads = input.threads.filter((thread) => thread.visibility === 'visible')
  const visiblePosts = input.posts.filter((post) => post.visibility === 'visible')

  for (const forum of input.forums) {
    const claimed = input.claimedForumTotals[forum.legacyId]
    if (claimed === undefined) continue

    const actualThreads = visibleThreads.filter(
      (thread) => thread.legacyForumId === forum.legacyId,
    ).length
    const actualPosts = visiblePosts.filter((post) => post.legacyForumId === forum.legacyId).length

    if (claimed.threads !== actualThreads) {
      differences.push({
        legacyId: forum.legacyId,
        field: 'threads',
        claimed: claimed.threads,
        actual: actualThreads,
      })
    }
    if (claimed.posts !== actualPosts) {
      differences.push({
        legacyId: forum.legacyId,
        field: 'posts',
        claimed: claimed.posts,
        actual: actualPosts,
      })
    }
  }

  for (const thread of visibleThreads) {
    const actual = Math.max(
      0,
      visiblePosts.filter((post) => post.legacyThreadId === thread.legacyId).length - 1,
    )
    if (thread.replyCount !== actual) {
      differences.push({
        legacyId: thread.legacyId,
        field: 'replies',
        claimed: thread.replyCount,
        actual,
      })
    }
  }

  return differences
}
