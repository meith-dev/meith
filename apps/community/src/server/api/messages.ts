import 'server-only'

import { idParam } from '@meith/api'
import { ValidationError } from '@meith/core'
import { sourceAsMarkdown } from '@meith/markdown'
import { parseFolder } from '@meith/messages'

import { dailyLimitMessage, limitMessage, spendDailyLimit, spendLimit } from '../antispam'
import { requireMessaging } from '../messages'
import { type ApiResult, type ApiRoutes, bodyFlag, bodyId, bodyText, notFound } from './http'

export const MESSAGE_HANDLERS: ApiRoutes = [
  [
    'GET',
    '/messages',
    async ({ actor, url }): Promise<ApiResult> => {
      const { service, userId } = await requireMessaging(actor)
      const folder = parseFolder(url.searchParams.get('folder') ?? '') ?? 'inbox'
      const before = idParam(url.searchParams.get('before') ?? undefined)

      const page = await service.list({
        userId,
        folder,
        ...(before === null ? {} : { before }),
      })

      return {
        status: 200,
        body: {
          data: page.rows.map((row) => ({
            copyId: row.copyId,
            messageId: row.messageId,
            folder: row.folder,
            role: row.role,
            subject: row.subject,
            sentAt: row.sentAt.toISOString(),
            readAt: row.readAt === null ? null : row.readAt.toISOString(),
            counterparties: [...row.counterparties],
            moreCounterparties: row.moreCounterparties,
          })),
          nextBefore: page.nextBefore,
        },
      }
    },
  ],

  [
    'GET',
    '/messages/:messageId',
    async ({ actor, params }): Promise<ApiResult> => {
      const messageId = idParam(params.messageId)
      if (messageId === null) return notFound()

      const { service, userId } = await requireMessaging(actor)
      const detail = await service.open({ messageId, userId })

      return {
        status: 200,
        body: {
          data: {
            id: detail.message.id,
            copyId: detail.copy.id,
            authorUserId: detail.message.authorUserId,
            authorUsername: detail.message.authorUsername,
            subject: detail.message.subject,
            message: sourceAsMarkdown(detail.message.message, detail.message.bodyFormat),
            folder: detail.copy.folder,
            role: detail.copy.role,
            receiptRequested: detail.message.receiptRequested,
            replyToId: detail.message.replyToId,
            sentAt: detail.message.sentAt.toISOString(),
            readAt: detail.copy.readAt === null ? null : detail.copy.readAt.toISOString(),
            participants: detail.participants.map((participant) => ({
              userId: participant.userId,
              username: participant.username,
              role: participant.role,
              readAt: participant.readAt === null ? null : participant.readAt.toISOString(),
            })),
          },
        },
      }
    },
  ],

  [
    'POST',
    '/messages',
    async ({ actor, body }): Promise<ApiResult> => {
      const { service, userId, username } = await requireMessaging(actor)

      const limited = await spendLimit({ scope: 'message', actor })
      if (limited !== null && !limited.allowed) throw new ValidationError(limitMessage(limited))

      const daily = await spendDailyLimit({ scope: 'message_day', actor })
      if (daily !== null && !daily.allowed) {
        throw new ValidationError(dailyLimitMessage('message_day', daily))
      }

      const id = await service.send({
        authorUserId: userId,
        authorUsername: username,
        to: bodyText(body, 'to'),
        bcc: bodyText(body, 'bcc'),
        subject: bodyText(body, 'subject'),
        message: bodyText(body, 'message'),
        receiptRequested: bodyFlag(body, 'receiptRequested'),
        replyToId: bodyId(body, 'replyToId'),
      })

      return { status: 201, body: { data: { id } } }
    },
  ],
]
