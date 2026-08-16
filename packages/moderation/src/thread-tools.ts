import { ValidationError } from '@meith/core'

export type ThreadTool =
  | 'lock'
  | 'unlock'
  | 'stick'
  | 'unstick'
  | 'move'
  | 'copy'
  | 'delete'
  | 'restore'

export interface ThreadToolTarget {
  readonly id: number
  readonly forumId: number
  readonly slug: string
  readonly title: string
  readonly isLocked: boolean
  readonly isSticky: boolean
  readonly visibility: 'visible' | 'unapproved' | 'deleted'
}

export interface MoveDestination {
  readonly id: number
  readonly type: 'category' | 'forum' | 'link'
  readonly allowThreads: boolean
}

export function keepsThreads(destination: MoveDestination): boolean {
  return destination.type === 'forum' || (destination.type === 'category' && destination.allowThreads)
}

export interface ThreadToolRights {
  readonly lock: boolean
  readonly stick: boolean
  readonly move: boolean
  readonly delete: boolean
  readonly restore: boolean
}

export interface ThreadToolOutcome {
  readonly tool: ThreadTool
  readonly threadId: number
  readonly slug: string
  readonly changed: boolean
}

export interface ThreadToolsRepository {
  find(threadId: number): Promise<ThreadToolTarget | null>
  findDestination(forumId: number): Promise<MoveDestination | null>

  setLocked(input: {
    readonly threadId: number
    readonly locked: boolean
    readonly actorUserId: number
    readonly at: Date
  }): Promise<boolean>

  setSticky(input: {
    readonly threadId: number
    readonly sticky: boolean
    readonly actorUserId: number
    readonly at: Date
  }): Promise<boolean>

  setVisibility(input: {
    readonly threadId: number
    readonly from: 'visible' | 'deleted'
    readonly to: 'visible' | 'deleted'
    readonly actorUserId: number
    readonly at: Date
  }): Promise<boolean>

  move(input: {
    readonly threadId: number
    readonly fromForumId: number
    readonly toForumId: number
    readonly actorUserId: number
    readonly at: Date
  }): Promise<boolean>

  copy(input: {
    readonly threadId: number
    readonly toForumId: number
    readonly actorUserId: number
    readonly at: Date
  }): Promise<{ threadId: number; slug: string; posts: number }>
}

export class ThreadTools {
  private readonly threads: ThreadToolsRepository
  private readonly now: () => Date

  constructor(deps: { threads: ThreadToolsRepository; now?: () => Date }) {
    this.threads = deps.threads
    this.now = deps.now ?? (() => new Date())
  }

  async apply(input: {
    readonly threadId: number
    readonly tool: ThreadTool
    readonly toForumId?: number | undefined
    readonly actorUserId: number
    readonly rights: ThreadToolRights
    readonly destinationRights?: ThreadToolRights | undefined
  }): Promise<ThreadToolOutcome> {
    const target = await this.threads.find(input.threadId)
    if (target === null) throw new ValidationError('That thread does not exist.')

    const at = this.now()
    const base = { threadId: target.id, slug: target.slug }

    switch (input.tool) {
      case 'lock':
      case 'unlock': {
        this.require(input.rights.lock, 'open and close threads')
        this.requireLive(target)
        const locked = input.tool === 'lock'
        return {
          ...base,
          tool: input.tool,
          changed: await this.threads.setLocked({
            threadId: target.id,
            locked,
            actorUserId: input.actorUserId,
            at,
          }),
        }
      }

      case 'stick':
      case 'unstick': {
        this.require(input.rights.stick, 'pin threads')
        this.requireLive(target)
        return {
          ...base,
          tool: input.tool,
          changed: await this.threads.setSticky({
            threadId: target.id,
            sticky: input.tool === 'stick',
            actorUserId: input.actorUserId,
            at,
          }),
        }
      }

      case 'delete': {
        this.require(input.rights.delete, 'delete threads')
        if (target.visibility !== 'visible') {
          throw new ValidationError('That thread is not on the board.')
        }
        return {
          ...base,
          tool: input.tool,
          changed: await this.threads.setVisibility({
            threadId: target.id,
            from: 'visible',
            to: 'deleted',
            actorUserId: input.actorUserId,
            at,
          }),
        }
      }

      case 'restore': {
        this.require(input.rights.restore, 'restore threads')
        if (target.visibility !== 'deleted') {
          throw new ValidationError('That thread is not deleted.')
        }
        return {
          ...base,
          tool: input.tool,
          changed: await this.threads.setVisibility({
            threadId: target.id,
            from: 'deleted',
            to: 'visible',
            actorUserId: input.actorUserId,
            at,
          }),
        }
      }

      case 'move':
        return { ...base, tool: 'move', changed: await this.moveTo(input, target, at) }

      case 'copy': {
        const copied = await this.copyTo(input, target, at)
        return {
          tool: 'copy',
          threadId: copied.threadId,
          slug: copied.slug,
          changed: true,
        }
      }
    }
  }

  private async moveTo(
    input: {
      readonly toForumId?: number | undefined
      readonly actorUserId: number
      readonly rights: ThreadToolRights
      readonly destinationRights?: ThreadToolRights | undefined
    },
    target: ThreadToolTarget,
    at: Date,
  ): Promise<boolean> {
    this.require(input.rights.move, 'move threads')
    this.requireLive(target)

    if (input.toForumId === undefined) {
      throw new ValidationError('Choose a forum to move it to.')
    }
    if (input.toForumId === target.forumId) {
      throw new ValidationError('That thread is already in that forum.')
    }

    if (input.destinationRights?.move !== true) {
      throw new ValidationError('You cannot move threads into that forum.')
    }

    const destination = await this.threads.findDestination(input.toForumId)
    if (destination === null || !keepsThreads(destination)) {
      throw new ValidationError('That is not a forum threads can live in.')
    }

    return this.threads.move({
      threadId: target.id,
      fromForumId: target.forumId,
      toForumId: input.toForumId,
      actorUserId: input.actorUserId,
      at,
    })
  }

  private async copyTo(
    input: {
      readonly toForumId?: number | undefined
      readonly actorUserId: number
      readonly rights: ThreadToolRights
      readonly destinationRights?: ThreadToolRights | undefined
    },
    target: ThreadToolTarget,
    at: Date,
  ): Promise<{ threadId: number; slug: string }> {
    this.require(input.rights.move, 'copy threads')
    this.requireLive(target)

    if (input.toForumId === undefined) {
      throw new ValidationError('Choose a forum to copy it to.')
    }
    if (input.destinationRights?.move !== true) {
      throw new ValidationError('You cannot copy threads into that forum.')
    }

    const destination = await this.threads.findDestination(input.toForumId)
    if (destination === null || !keepsThreads(destination)) {
      throw new ValidationError('That is not a forum threads can live in.')
    }

    return this.threads.copy({
      threadId: target.id,
      toForumId: input.toForumId,
      actorUserId: input.actorUserId,
      at,
    })
  }

  private require(held: boolean, what: string): void {
    if (!held) throw new ValidationError(`You cannot ${what} here.`)
  }

  private requireLive(target: ThreadToolTarget): void {
    if (target.visibility !== 'visible') {
      throw new ValidationError('That thread is not on the board.')
    }
  }
}

export function parseThreadTool(value: string | undefined): ThreadTool | null {
  const tools: readonly ThreadTool[] = [
    'lock',
    'unlock',
    'stick',
    'unstick',
    'move',
    'copy',
    'delete',
    'restore',
  ]
  return tools.includes(value as ThreadTool) ? (value as ThreadTool) : null
}
