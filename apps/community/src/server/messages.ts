import 'server-only'

import { cache } from 'react'

import type { Actor } from '@meith/authorization'
import { ForbiddenError } from '@meith/core'
import { currentRequestId } from '@meith/core/logger'
import { msg } from '@meith/i18n'
import { EMPTY_VOCABULARY } from '@meith/markdown'
import {
  type MessageAudit,
  type MessageNotifierPort,
  type MessagePolicy,
  MessageService,
} from '@meith/messages'

import { getContainer } from './container'
import { activeVocabulary } from './content-admin'
import { boardRendering } from './markdown-pipeline'
import { notificationService } from './notifications'
import { emitEvent, filterView } from './plugin-view'
import { relationService } from './relations'

const PLUGIN_AUDIT: MessageAudit = {
  before: (input) => filterView('pm.send.before', input, { requestId: currentRequestId() ?? null }),

  sent: (input) => emitEvent('pm.sent', input, { requestId: currentRequestId() ?? null }),
}

export function messageService(): MessageService | null {
  const { messages } = getContainer()
  if (messages === null) return null

  return new MessageService({
    messages,
    policy: messagePolicy(),
    notifier: messageNotifier(),
    vocabulary: async () => (await activeVocabulary()) ?? EMPTY_VOCABULARY,
    rendering: boardRendering,
    audit: PLUGIN_AUDIT,
  })
}

export interface Messaging {
  readonly service: MessageService
  readonly userId: number
  readonly username: string
}

export async function requireMessaging(actor: Actor): Promise<Messaging> {
  const { authorizer, accountStore } = getContainer()

  if (actor.userId === null) throw new ForbiddenError(msg('error.app.must-logged'))
  if (!authorizer.can(actor, 'pm.use')) {
    throw new ForbiddenError(msg('error.app.use-private-messages'))
  }

  const service = messageService()
  if (service === null) {
    throw new ForbiddenError(msg('error.app.board-running-in-memory-sample-data-21'))
  }

  const account = await accountStore.accounts.findById(actor.userId)
  if (account === null) throw new ForbiddenError(msg('error.app.must-logged'))

  return { service, userId: actor.userId, username: account.username }
}

export function messagePolicy(): MessagePolicy {
  const { accountStore, actorSource, authorizer } = getContainer()

  return {
    async lookup(username) {
      const { foldIdentifier } = await import('@meith/accounts')
      const account = await accountStore.accounts.findByUsernameLower(foldIdentifier(username))
      if (account === null) return null
      return { id: account.id, username: account.username }
    },

    async limitsFor(userId) {
      const actor = await actorSource.buildForUser(userId)
      if (actor === null) return { quota: 0, canReceive: false }

      return {
        canReceive: authorizer.can(actor, 'pm.use'),
        quota: authorizer.globalLimit(actor, 'privateMessageQuota'),
      }
    },

    async blocks(ownerUserId, senderUserId) {
      const service = relationService()
      if (service === null) return false

      try {
        return await service.ignores(ownerUserId, senderUserId)
      } catch {
        return true
      }
    },
  }
}

export function messageNotifier(): MessageNotifierPort | null {
  const service = notificationService()
  if (service === null) return null

  return {
    async messageReceived(input) {
      await service.raise({
        userId: input.userId,
        kind: 'pm.received',
        data: { fromUsername: input.fromUsername, subject: input.subject },
        href: `/messages/${input.messageId}`,
      })
    },

    async receiptRead(input) {
      await service.raise({
        userId: input.userId,
        kind: 'pm.receipt',
        data: { byUsername: input.byUsername, subject: input.subject },
        dedupeKey: `pm.receipt:${input.messageId}`,
        href: `/messages/${input.messageId}`,
      })
    },
  }
}

export const unreadMessageCount = cache(async function unreadMessageCount(
  userId: number | null,
): Promise<number> {
  if (userId === null) return 0
  const service = messageService()
  if (service === null) return 0

  try {
    return (await service.counts(userId)).unread
  } catch {
    return 0
  }
})
