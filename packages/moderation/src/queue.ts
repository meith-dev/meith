import { ValidationError } from '@meith/core'

export type QueueItemKind = 'thread' | 'post'

export interface QueueSelection {
  readonly kind: QueueItemKind
  readonly id: number
}

export interface QueueItem extends QueueSelection {
  readonly forumId: number
  readonly forumTitle: string
  readonly threadId: number
  readonly threadSlug: string
  readonly threadTitle: string
  readonly authorUserId: number | null
  readonly authorUsername: string
  readonly excerpt: string
  readonly createdAt: Date
}

export interface QueuePage {
  readonly items: readonly QueueItem[]
  readonly nextCursor?: string
}

export interface PendingItem extends QueueSelection {
  readonly forumId: number
}

export type QueueDecision = 'approve' | 'reject'

export interface QueueOutcome {
  readonly decision: QueueDecision
  readonly applied: number
  readonly refused: number
  readonly missing: number
}

export interface ModerationQueueRepository {
  list(
    forumIds: readonly number[],
    options: {
      readonly limit: number
      readonly after?: string
      readonly offset?: number
    },
  ): Promise<QueuePage>

  countPending(forumIds: readonly number[]): Promise<number>

  resolve(selection: readonly QueueSelection[]): Promise<readonly PendingItem[]>

  apply(input: {
    readonly decision: QueueDecision
    readonly threadIds: readonly number[]
    readonly postIds: readonly number[]
    readonly actorUserId: number
    readonly at: Date
  }): Promise<number>
}

export const MAX_CHUNK = 200

export const QUEUE_PAGE_SIZE = 25

export class ModerationQueue {
  private readonly queue: ModerationQueueRepository
  private readonly now: () => Date

  constructor(deps: { queue: ModerationQueueRepository; now?: () => Date }) {
    this.queue = deps.queue
    this.now = deps.now ?? (() => new Date())
  }

  async list(
    moderatedForumIds: readonly number[],
    options: { readonly after?: string; readonly offset?: number } = {},
  ): Promise<QueuePage> {
    if (moderatedForumIds.length === 0) return { items: [] }
    return this.queue.list(moderatedForumIds, {
      limit: QUEUE_PAGE_SIZE,
      ...(options.after === undefined ? {} : { after: options.after }),
      ...(options.offset === undefined ? {} : { offset: options.offset }),
    })
  }

  async countPending(moderatedForumIds: readonly number[]): Promise<number> {
    if (moderatedForumIds.length === 0) return 0
    return this.queue.countPending(moderatedForumIds)
  }

  async decide(input: {
    readonly selection: readonly QueueSelection[]
    readonly decision: QueueDecision
    readonly moderatedForumIds: ReadonlySet<number>
    readonly actorUserId: number
  }): Promise<QueueOutcome> {
    if (input.selection.length === 0) {
      throw new ValidationError('Select at least one item.')
    }
    if (input.selection.length > MAX_CHUNK) {
      throw new ValidationError(
        `At most ${MAX_CHUNK} items can be handled at once. Work through the queue a page at a time.`,
      )
    }

    const unique = new Map<string, QueueSelection>()
    for (const item of input.selection) unique.set(`${item.kind}:${item.id}`, item)

    const pending = await this.queue.resolve([...unique.values()])
    const missing = unique.size - pending.length

    const allowed = pending.filter((item) => input.moderatedForumIds.has(item.forumId))
    const refused = pending.length - allowed.length

    const applied =
      allowed.length === 0
        ? 0
        : await this.queue.apply({
            decision: input.decision,
            threadIds: allowed.filter((i) => i.kind === 'thread').map((i) => i.id),
            postIds: allowed.filter((i) => i.kind === 'post').map((i) => i.id),
            actorUserId: input.actorUserId,
            at: this.now(),
          })

    return { decision: input.decision, applied, refused, missing }
  }
}

export function parseSelection(values: readonly string[]): QueueSelection[] {
  const out: QueueSelection[] = []
  for (const value of values) {
    const match = /^(thread|post):([1-9]\d*)$/.exec(value)
    if (!match) continue
    const id = Number(match[2])
    if (!Number.isSafeInteger(id)) continue
    out.push({ kind: match[1] as QueueItemKind, id })
  }
  return out
}
