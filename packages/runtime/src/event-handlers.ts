import { EventRegistry } from '@meith/events'

export interface EventHandlerDeps {
  readonly counters: {
    rollUpAncestors(postId: number): Promise<boolean>
    applyVisibilityChange(postId: number): Promise<boolean>
  }
  readonly notifications?: {
    deliverEmail(notificationId: number): Promise<void>
  }
  readonly attachments?: {
    process(attachmentId: number): Promise<unknown>
  }
  readonly avatars?: {
    process(userId: number): Promise<unknown>
  }
  readonly massMail?: {
    send(input: { massMailId: number; userId: number; email: string }): Promise<void>
  }
}

export function buildEventRegistry(deps: EventHandlerDeps): EventRegistry {
  const registry = new EventRegistry()
    .register({
      id: 'counters.rollup',
      event: 'post.created',
      async handle(payload) {
        await deps.counters.rollUpAncestors(payload.postId)
      },
    })
    .register({
      id: 'counters.visibility',
      event: 'post.visibility_changed',
      async handle(payload) {
        await deps.counters.applyVisibilityChange(payload.postId)
      },
    })

  if (deps.attachments !== undefined) {
    registry.register({
      id: 'attachments.process',
      event: 'attachment.uploaded',
      async handle(payload) {
        await deps.attachments!.process(payload.attachmentId)
      },
    })
  }

  if (deps.avatars !== undefined) {
    registry.register({
      id: 'avatars.process',
      event: 'avatar.uploaded',
      async handle(payload) {
        await deps.avatars!.process(payload.userId)
      },
    })
  }

  if (deps.massMail !== undefined) {
    registry.register({
      id: 'admin.mass_mail',
      event: 'admin.mass_mail_queued',
      async handle(payload) {
        await deps.massMail!.send({
          massMailId: payload.massMailId,
          userId: payload.userId,
          email: payload.email,
        })
      },
    })
  }

  if (deps.notifications === undefined) return registry

  return registry.register({
    id: 'notifications.email',
    event: 'notification.created',
    async handle(payload) {
      await deps.notifications!.deliverEmail(payload.notificationId)
    },
  })
}
