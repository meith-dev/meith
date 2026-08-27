import { definePlugin } from '@meith/plugin-kit'

import { isDeliverable, resolveWebhooksConfig } from './config'
import en from './messages/en.json'
import { bodyFor, type WebhookEvent } from './payload'
import { enqueue } from './queue'
import { deliverBatch } from './run'
import { WEBHOOKS_MIGRATIONS } from './schema'
import { StatusPage } from './ui/admin'

export const DELIVER_INTERVAL_SECONDS = 60

async function queue(
  runtime: () => Promise<{
    settings: Readonly<Record<string, string | number | boolean>>
    data: Parameters<typeof enqueue>[0]
    logger: { warn: (message: string, detail?: Record<string, unknown>) => void }
  }>,
  event: WebhookEvent,
): Promise<void> {
  const context = await runtime()
  const config = resolveWebhooksConfig(context.settings)
  if (!isDeliverable(config)) return

  await enqueue(
    context.data,
    event.kind,
    JSON.stringify(bodyFor(event, config.format, config.boardUrl)),
  )
}

export const webhooksPlugin = definePlugin({
  key: 'webhooks',
  name: en['webhooks.definition.name'],
  nameKey: 'webhooks.definition.name',
  version: '0.22.0',
  description: en['webhooks.definition.description'],
  descriptionKey: 'webhooks.definition.description',
  apiVersion: '0',

  settings: [
    {
      key: 'endpoint_url',
      label: en['webhooks.setting.endpoint.label'],
      labelKey: 'webhooks.setting.endpoint.label',
      description: en['webhooks.setting.endpoint.description'],
      descriptionKey: 'webhooks.setting.endpoint.description',
      env: 'WEBHOOKS_ENDPOINT_URL',
      default: '',
    },
    {
      key: 'format',
      label: en['webhooks.setting.format.label'],
      labelKey: 'webhooks.setting.format.label',
      type: 'select',
      options: [
        { value: 'discord', label: en['webhooks.setting.format.discord'] },
        { value: 'json', label: en['webhooks.setting.format.json'] },
      ],
      default: 'discord',
    },
    {
      key: 'events',
      label: en['webhooks.setting.events.label'],
      labelKey: 'webhooks.setting.events.label',
      type: 'select',
      options: [
        { value: 'threads', label: en['webhooks.setting.events.threads'] },
        { value: 'threads-and-posts', label: en['webhooks.setting.events.threadsAndPosts'] },
      ],
      default: 'threads',
    },
    {
      key: 'board_url',
      label: en['webhooks.setting.boardUrl.label'],
      labelKey: 'webhooks.setting.boardUrl.label',
      description: en['webhooks.setting.boardUrl.description'],
      descriptionKey: 'webhooks.setting.boardUrl.description',
      env: 'WEBHOOKS_BOARD_URL',
      default: '',
    },
    {
      key: 'signing_secret',
      label: en['webhooks.setting.secret.label'],
      labelKey: 'webhooks.setting.secret.label',
      description: en['webhooks.setting.secret.description'],
      descriptionKey: 'webhooks.setting.secret.description',
      type: 'secret',
      env: 'WEBHOOKS_SIGNING_SECRET',
      default: '',
      advanced: true,
    },
  ],

  migrations: WEBHOOKS_MIGRATIONS,

  tasks: [
    {
      id: 'deliver',
      intervalSeconds: DELIVER_INTERVAL_SECONDS,
      run: async (context) => {
        const outcome = await deliverBatch(context)
        if (outcome.attempted > 0) {
          context.logger.info('webhooks: delivered a batch', { ...outcome })
        }
      },
    },
  ],

  adminPages: [
    {
      path: 'status',
      title: en['webhooks.admin.status.title'],
      titleKey: 'webhooks.admin.status.title',
      render: StatusPage,
    },
  ],

  hooks: {
    'thread.created': async (thread, _context, runtime) => {
      await queue(runtime, {
        kind: 'thread.created',
        threadId: thread.threadId,
        forumId: thread.forumId,
        authorId: thread.authorId,
        subject: thread.subject,
      })
    },

    'post.created': async (post, _context, runtime) => {
      const context = await runtime()
      if (!resolveWebhooksConfig(context.settings).sendPosts) return

      await queue(runtime, {
        kind: 'post.created',
        postId: post.postId,
        threadId: post.threadId,
        forumId: post.forumId,
        authorId: post.authorId,
      })
    },
  },
})
