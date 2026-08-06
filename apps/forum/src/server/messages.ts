import 'server-only'

import { MessageService, type MessageNotifierPort, type MessagePolicy } from '@meith/messages'

import { EMPTY_VOCABULARY } from '@meith/markdown'

import { activeVocabulary } from './content-admin'
import { getContainer } from './container'
import { relationService } from './relations'
import { notificationService } from './notifications'

export function messageService(): MessageService | null {
  const { messages } = getContainer()
  if (messages === null) return null

  return new MessageService({
    messages,
    policy: messagePolicy(),
    notifier: messageNotifier(),
    vocabulary: async () => (await activeVocabulary()) ?? EMPTY_VOCABULARY,
  })
}

export function messagePolicy(): MessagePolicy {
  const { accountStore, actorSource, authorizer } = getContainer()

  return {
    async lookup(username) {
      const { foldIdentifier } = await import('@meith/accounts')
      const account = await accountStore.accounts.findByUsernameLower(
        foldIdentifier(username),
      )
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

export async function unreadMessageCount(userId: number | null): Promise<number> {
  if (userId === null) return 0
  const service = messageService()
  if (service === null) return 0

  try {
    return (await service.counts(userId)).unread
  } catch {
    return 0
  }
}
