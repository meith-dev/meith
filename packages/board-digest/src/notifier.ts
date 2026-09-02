import { mintUnsubscribeToken } from '@meith/subscriptions'

import { BOARD_DIGEST_CADENCE_INTERVAL_MS, type BoardDigestCadence } from './modes'
import type {
  BoardDigestContentSource,
  BoardDigestNotifierPort,
  BoardDigestRepository,
  BoardDigestThread,
} from './types'

export const MAX_MEMBERS_PER_RUN = 50

export const MAX_THREADS_CONSIDERED = 50

export const MAX_THREADS_IN_BOARD_DIGEST = 10

const DAY_MS = 24 * 60 * 60 * 1000

export interface RunOutcome {
  readonly notified: number
  readonly considered: number
}

export class BoardDigestNotifier {
  private readonly repository: BoardDigestRepository
  private readonly content: BoardDigestContentSource
  private readonly notifications: BoardDigestNotifierPort
  private readonly secret: string | null
  private readonly now: () => Date

  constructor(deps: {
    repository: BoardDigestRepository
    content: BoardDigestContentSource
    notifications: BoardDigestNotifierPort
    unsubscribeSecret?: string | null
    now?: () => Date
  }) {
    this.repository = deps.repository
    this.content = deps.content
    this.notifications = deps.notifications
    this.secret = deps.unsubscribeSecret ?? null
    this.now = deps.now ?? (() => new Date())
  }

  async run(
    cadence: BoardDigestCadence,
    lapsedThresholdDays: number,
    limit = MAX_MEMBERS_PER_RUN,
    signal?: AbortSignal,
  ): Promise<RunOutcome> {
    const at = this.now()
    const dueBefore = new Date(at.getTime() - BOARD_DIGEST_CADENCE_INTERVAL_MS[cadence])
    const lapsedBefore = new Date(at.getTime() - lapsedThresholdDays * DAY_MS)

    const members = await this.repository.dueMembers({ cadence, dueBefore, lapsedBefore, limit })

    let notified = 0
    let considered = 0

    for (const member of members) {
      if (signal?.aborted === true) break
      considered += 1

      try {
        const threads = await this.content.threadsActiveSince(
          member.userId,
          member.lastActiveAt,
          MAX_THREADS_CONSIDERED,
        )
        if (threads.length === 0) continue

        await this.notifications.raise({
          userId: member.userId,
          kind: 'board.digest',
          data: {
            cadence,
            threadCount: threads.length,
            threads: threads.slice(0, MAX_THREADS_IN_BOARD_DIGEST).map(threadPayload),
            more: Math.max(0, threads.length - MAX_THREADS_IN_BOARD_DIGEST),
            unsubscribe: this.token(member.userId),
          },
          href: '/notifications/preferences',
          dedupeKey: null,
        })

        await this.repository.recordDigestRun({ userId: member.userId, at })
        notified += 1
      } catch {}
    }

    return { notified, considered }
  }

  private token(userId: number): string | null {
    return this.secret === null
      ? null
      : mintUnsubscribeToken({ userId, scope: 'board-digest', targetId: 0 }, this.secret)
  }
}

function threadPayload(thread: BoardDigestThread): Record<string, unknown> {
  return {
    title: thread.title,
    href: thread.href,
    forumTitle: thread.forumTitle,
    replyCount: thread.replyCount,
    lastAuthor: thread.lastAuthor,
  }
}
