import { ValidationError } from '@meith/core'
import { msg } from '@meith/i18n'

export interface SurgeryThread {
  readonly id: number
  readonly forumId: number
  readonly slug: string
  readonly title: string
  readonly visibility: 'visible' | 'unapproved' | 'deleted'
  readonly firstPostId: number | null
  readonly visiblePosts: number
}

export interface SplitPlan {
  readonly sourceThreadId: number
  readonly title: string
  readonly postIds: readonly number[]
}

export interface MergePlan {
  readonly sourceThreadId: number
  readonly targetThreadId: number
}

export interface SurgeryOutcome {
  readonly threadId: number
  readonly slug: string
  readonly posts: number
}

export interface ThreadSurgeryRepository {
  find(threadId: number): Promise<SurgeryThread | null>

  postsFrom(threadId: number, fromPostId: number): Promise<readonly number[]>

  visiblePostIdsIn(threadId: number, postIds: readonly number[]): Promise<readonly number[]>

  split(plan: SplitPlan & { actorUserId: number; at: Date }): Promise<SurgeryOutcome>

  merge(plan: MergePlan & { actorUserId: number; at: Date }): Promise<SurgeryOutcome>
}

export interface SurgeryRights {
  readonly merge: boolean
  readonly split: boolean
}

export class ThreadSurgery {
  private readonly threads: ThreadSurgeryRepository
  private readonly now: () => Date

  constructor(deps: { threads: ThreadSurgeryRepository; now?: () => Date }) {
    this.threads = deps.threads
    this.now = deps.now ?? (() => new Date())
  }

  async split(input: {
    readonly threadId: number
    readonly fromPostId: number
    readonly title: string
    readonly actorUserId: number
    readonly rights: SurgeryRights
  }): Promise<SurgeryOutcome> {
    if (!input.rights.split) throw new ValidationError(msg('error.moderation.split-threads-here'))

    const source = await this.requireLive(input.threadId)

    const title = this.requireTitle(input.title)

    if (source.firstPostId !== null && input.fromPostId === source.firstPostId) {
      throw new ValidationError(msg('error.moderation.whole-thread-move-instead-splitting'))
    }

    const postIds = await this.threads.postsFrom(input.threadId, input.fromPostId)
    if (postIds.length === 0) {
      throw new ValidationError(msg('error.moderation.post-thread'))
    }
    if (postIds.length >= source.visiblePosts) {
      throw new ValidationError(msg('error.moderation.whole-thread-move-instead-splitting'))
    }

    return this.threads.split({
      sourceThreadId: source.id,
      title,
      postIds,
      actorUserId: input.actorUserId,
      at: this.now(),
    })
  }

  async splitPosts(input: {
    readonly threadId: number
    readonly postIds: readonly number[]
    readonly title: string
    readonly actorUserId: number
    readonly rights: SurgeryRights
  }): Promise<SurgeryOutcome & { readonly dropped: number }> {
    if (!input.rights.split) throw new ValidationError(msg('error.moderation.split-threads-here'))

    const source = await this.requireLive(input.threadId)
    const title = this.requireTitle(input.title)

    if (input.postIds.length === 0) {
      throw new ValidationError(msg('error.moderation.select-posts-split-out'))
    }

    const eligible = await this.threads.visiblePostIdsIn(input.threadId, input.postIds)
    const dropped = new Set(input.postIds).size - eligible.length

    if (eligible.length === 0) {
      throw new ValidationError(msg('error.moderation.none-those-posts-thread'))
    }
    if (source.firstPostId !== null && eligible.includes(source.firstPostId)) {
      throw new ValidationError(msg('error.moderation.selection-includes-opening-post-move'))
    }
    if (eligible.length >= source.visiblePosts) {
      throw new ValidationError(msg('error.moderation.whole-thread-move-instead-splitting'))
    }

    const outcome = await this.threads.split({
      sourceThreadId: source.id,
      title,
      postIds: eligible,
      actorUserId: input.actorUserId,
      at: this.now(),
    })
    return { ...outcome, dropped }
  }

  async merge(input: {
    readonly sourceThreadId: number
    readonly targetThreadId: number
    readonly actorUserId: number
    readonly rights: SurgeryRights
    readonly targetRights: SurgeryRights
  }): Promise<SurgeryOutcome> {
    if (!input.rights.merge) throw new ValidationError(msg('error.moderation.merge-threads-here'))

    if (input.sourceThreadId === input.targetThreadId) {
      throw new ValidationError(msg('error.moderation.thread-merged-into-itself'))
    }

    const source = await this.requireLive(input.sourceThreadId)
    const target = await this.requireLive(input.targetThreadId)

    if (!input.targetRights.merge) {
      throw new ValidationError(msg('error.moderation.merge-threads-into-forum'))
    }

    return this.threads.merge({
      sourceThreadId: source.id,
      targetThreadId: target.id,
      actorUserId: input.actorUserId,
      at: this.now(),
    })
  }

  private requireTitle(raw: string): string {
    const title = raw.trim()
    if (title.length < 3) throw new ValidationError(msg('error.moderation.new-thread-needs-title'))
    if (title.length > 150) {
      throw new ValidationError(msg('error.moderation.title-at-most-150-characters'))
    }
    return title
  }

  private async requireLive(threadId: number): Promise<SurgeryThread> {
    const thread = await this.threads.find(threadId)
    if (thread === null) throw new ValidationError(msg('error.moderation.thread-exist'))
    if (thread.visibility !== 'visible') {
      throw new ValidationError(msg('error.moderation.thread-board'))
    }
    return thread
  }
}
