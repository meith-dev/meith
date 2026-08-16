import { ValidationError } from '@meith/core'

import { keepsThreads, type MoveDestination } from './thread-tools'
import type { QueueSelection } from './queue'

export type InlineTool =
  | 'approve'
  | 'delete'
  | 'restore'
  | 'lock'
  | 'unlock'
  | 'stick'
  | 'unstick'
  | 'move'

export interface InlineTarget extends QueueSelection {
  readonly forumId: number
  readonly visibility: 'visible' | 'unapproved' | 'deleted'
  readonly threadVisibility: 'visible' | 'unapproved' | 'deleted'
  readonly isLocked: boolean
  readonly isSticky: boolean
}

export interface InlineRights {
  readonly approve: boolean
  readonly lock: boolean
  readonly stick: boolean
  readonly move: boolean
  readonly deleteThreads: boolean
  readonly deletePosts: boolean
  readonly restoreThreads: boolean
  readonly restorePosts: boolean
}

export const NO_INLINE_RIGHTS: InlineRights = {
  approve: false,
  lock: false,
  stick: false,
  move: false,
  deleteThreads: false,
  deletePosts: false,
  restoreThreads: false,
  restorePosts: false,
}

export interface InlineRightsResolver {
  rightsIn(forumId: number): Promise<InlineRights>
}

export interface InlineOutcome {
  readonly tool: InlineTool
  readonly applied: number
  readonly refused: number
  readonly missing: number
  readonly skipped: number
}

export interface InlineModerationRepository {
  resolve(
    selection: readonly QueueSelection[],
    forumIds: readonly number[],
  ): Promise<readonly InlineTarget[]>

  findDestination(forumId: number): Promise<MoveDestination | null>

  apply(input: {
    readonly tool: InlineTool
    readonly threadIds: readonly number[]
    readonly postIds: readonly number[]
    readonly toForumId?: number | undefined
    readonly actorUserId: number
    readonly at: Date
  }): Promise<number>
}

export const INLINE_CHUNK = 25

export const MAX_INLINE_SELECTION = 500

const THREAD_ONLY: ReadonlySet<InlineTool> = new Set<InlineTool>([
  'lock',
  'unlock',
  'stick',
  'unstick',
  'move',
])

export class InlineModeration {
  private readonly repo: InlineModerationRepository
  private readonly now: () => Date

  constructor(deps: { inline: InlineModerationRepository; now?: () => Date }) {
    this.repo = deps.inline
    this.now = deps.now ?? (() => new Date())
  }

  async apply(input: {
    readonly selection: readonly QueueSelection[]
    readonly tool: InlineTool
    readonly toForumId?: number | undefined
    readonly scopeForumIds: readonly number[]
    readonly rights: InlineRightsResolver
    readonly actorUserId: number
  }): Promise<InlineOutcome> {
    if (input.selection.length === 0) {
      throw new ValidationError('Select at least one item.')
    }
    if (input.selection.length > MAX_INLINE_SELECTION) {
      throw new ValidationError(
        `At most ${MAX_INLINE_SELECTION} items can be moderated at once.`,
      )
    }

    const unique = new Map<string, QueueSelection>()
    for (const item of input.selection) unique.set(`${item.kind}:${item.id}`, item)

    if (input.scopeForumIds.length === 0) {
      return { tool: input.tool, applied: 0, refused: 0, missing: unique.size, skipped: 0 }
    }

    const targets = await this.repo.resolve([...unique.values()], input.scopeForumIds)
    const missing = unique.size - targets.length

    if (input.tool === 'move') {
      await this.requireDestination(input.toForumId, input.rights)
    }

    let refused = 0
    let skipped = 0
    const allowed: InlineTarget[] = []
    const rightsByForum = new Map<number, InlineRights>()

    for (const target of targets) {
      let rights = rightsByForum.get(target.forumId)
      if (rights === undefined) {
        rights = await input.rights.rightsIn(target.forumId)
        rightsByForum.set(target.forumId, rights)
      }

      if (!holdsRight(input.tool, target.kind, rights)) {
        refused += 1
        continue
      }
      if (!isApplicable(input.tool, target, input.toForumId)) {
        skipped += 1
        continue
      }
      allowed.push(target)
    }

    let applied = 0
    for (const chunk of chunked(allowed, INLINE_CHUNK)) {
      applied += await this.repo.apply({
        tool: input.tool,
        threadIds: chunk.filter((i) => i.kind === 'thread').map((i) => i.id),
        postIds: chunk.filter((i) => i.kind === 'post').map((i) => i.id),
        ...(input.toForumId === undefined ? {} : { toForumId: input.toForumId }),
        actorUserId: input.actorUserId,
        at: this.now(),
      })
    }

    return {
      tool: input.tool,
      applied,
      refused,
      missing,
      skipped: skipped + (allowed.length - applied),
    }
  }

  private async requireDestination(
    toForumId: number | undefined,
    rights: InlineRightsResolver,
  ): Promise<void> {
    if (toForumId === undefined) {
      throw new ValidationError('Choose a forum to move them to.')
    }
    const destinationRights = await rights.rightsIn(toForumId)
    if (!destinationRights.move) {
      throw new ValidationError('You cannot move threads into that forum.')
    }
    const destination = await this.repo.findDestination(toForumId)
    if (destination === null || !keepsThreads(destination)) {
      throw new ValidationError('That is not a forum threads can live in.')
    }
  }
}

function holdsRight(
  tool: InlineTool,
  kind: QueueSelection['kind'],
  rights: InlineRights,
): boolean {
  if (THREAD_ONLY.has(tool) && kind === 'post') return true

  switch (tool) {
    case 'approve':
      return rights.approve
    case 'delete':
      return kind === 'thread' ? rights.deleteThreads : rights.deletePosts
    case 'restore':
      return kind === 'thread' ? rights.restoreThreads : rights.restorePosts
    case 'lock':
    case 'unlock':
      return rights.lock
    case 'stick':
    case 'unstick':
      return rights.stick
    case 'move':
      return rights.move
  }
}

function isApplicable(
  tool: InlineTool,
  target: InlineTarget,
  toForumId: number | undefined,
): boolean {
  if (THREAD_ONLY.has(tool) && target.kind === 'post') return false

  switch (tool) {
    case 'approve':
      return (
        target.visibility === 'unapproved' &&
        (target.kind === 'thread' || target.threadVisibility === 'visible')
      )
    case 'delete':
      return target.visibility === 'visible'
    case 'restore':
      return target.visibility === 'deleted'
    case 'lock':
      return target.visibility === 'visible' && !target.isLocked
    case 'unlock':
      return target.visibility === 'visible' && target.isLocked
    case 'stick':
      return target.visibility === 'visible' && !target.isSticky
    case 'unstick':
      return target.visibility === 'visible' && target.isSticky
    case 'move':
      return target.visibility === 'visible' && target.forumId !== toForumId
  }
}

function chunked<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export function parseInlineTool(value: string | undefined): InlineTool | null {
  const tools: readonly InlineTool[] = [
    'approve',
    'delete',
    'restore',
    'lock',
    'unlock',
    'stick',
    'unstick',
    'move',
  ]
  return tools.includes(value as InlineTool) ? (value as InlineTool) : null
}

export const INLINE_TOOL_ACTIONS = {
  approve: ['content.approve'],
  lock: ['thread.lock'],
  unlock: ['thread.lock'],
  stick: ['thread.stick'],
  unstick: ['thread.stick'],
  move: ['thread.move'],
  delete: ['thread.delete', 'post.softDelete'],
  restore: ['thread.restore', 'post.restore'],
} as const satisfies Readonly<Record<InlineTool, readonly string[]>>
