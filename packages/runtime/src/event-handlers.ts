import { randomUUID } from 'node:crypto'

import { formatWebhookPayload, type WebhookFormat, type WebhookTopic } from '@meith/api'
import { EventRegistry } from '@meith/events'

export interface WebhookFanout {
  listActiveByTopic(
    topic: WebhookTopic,
  ): Promise<readonly { readonly id: number; readonly format: WebhookFormat }[]>
  enqueue(
    webhookId: number,
    topic: WebhookTopic,
    deliveryId: string,
    payload: Record<string, unknown>,
  ): Promise<boolean>
  boardUrl(): Promise<string>
  newDeliveryId?(): string
}

async function fanOutWebhook(
  webhooks: WebhookFanout,
  topic: WebhookTopic,
  ids: Readonly<Record<string, unknown>>,
): Promise<void> {
  const subscriptions = await webhooks.listActiveByTopic(topic)
  if (subscriptions.length === 0) return

  const boardUrl = await webhooks.boardUrl()
  const nextId = webhooks.newDeliveryId ?? randomUUID

  for (const subscription of subscriptions) {
    await webhooks.enqueue(
      subscription.id,
      topic,
      nextId(),
      formatWebhookPayload(topic, ids, subscription.format, boardUrl),
    )
  }
}

export interface EventHandlerDeps {
  readonly counters: {
    rollUpAncestors(postId: number): Promise<boolean>
    applyVisibilityChange(postId: number): Promise<boolean>
  }
  readonly notifications?: {
    deliverEmail?(notificationId: number): Promise<void>
    deliverPush?(notificationId: number): Promise<void>
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
  readonly webhooks?: WebhookFanout
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

  const webhooks = deps.webhooks
  if (webhooks !== undefined) {
    registry
      .register({
        id: 'webhooks.thread.created',
        event: 'thread.created',
        async handle(payload) {
          await fanOutWebhook(webhooks, 'thread.created', {
            threadId: payload.threadId,
            forumId: payload.forumId,
            authorId: payload.authorId,
          })
        },
      })
      .register({
        id: 'webhooks.post.created',
        event: 'post.created',
        async handle(payload) {
          await fanOutWebhook(webhooks, 'post.created', {
            postId: payload.postId,
            threadId: payload.threadId,
            forumId: payload.forumId,
            authorId: payload.authorId,
          })
        },
      })
      .register({
        id: 'webhooks.post.edited',
        event: 'post.edited',
        async handle(payload) {
          await fanOutWebhook(webhooks, 'post.edited', {
            postId: payload.postId,
            threadId: payload.threadId,
          })
        },
      })
      .register({
        id: 'webhooks.post.deleted',
        event: 'post.deleted',
        async handle(payload) {
          await fanOutWebhook(webhooks, 'post.deleted', {
            postId: payload.postId,
            threadId: payload.threadId,
            forumId: payload.forumId,
          })
        },
      })
      .register({
        id: 'webhooks.user.registered',
        event: 'user.registered',
        async handle(payload) {
          await fanOutWebhook(webhooks, 'user.registered', {
            userId: payload.userId,
            requiresActivation: payload.requiresActivation,
          })
        },
      })
      .register({
        id: 'webhooks.report.created',
        event: 'report.created',
        async handle(payload) {
          await fanOutWebhook(webhooks, 'report.created', {
            reportId: payload.reportId,
            targetKind: payload.targetKind,
            targetId: payload.targetId,
            reporterId: payload.reporterId,
          })
        },
      })
  }

  const notifications = deps.notifications
  if (notifications === undefined) return registry

  if (notifications.deliverEmail !== undefined) {
    registry.register({
      id: 'notifications.email',
      event: 'notification.created',
      async handle(payload) {
        await notifications.deliverEmail!(payload.notificationId)
      },
    })
  }

  if (notifications.deliverPush !== undefined) {
    registry.register({
      id: 'notifications.push',
      event: 'notification.created',
      async handle(payload) {
        await notifications.deliverPush!(payload.notificationId)
      },
    })
  }

  return registry
}
