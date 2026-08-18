import { EN_CATALOG, sourceTranslator, type Translator } from '@meith/i18n'

import { notificationKind } from './kinds'
import type { NotificationData, NotificationRecord } from './types'

export interface NotificationView {
  readonly id: number
  readonly subject: string
  readonly body: string
  readonly href: string | null
  readonly kind: string
  readonly occurrences: number
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly isRead: boolean
  readonly unsubscribeToken: string | null
}

function objects(data: NotificationData, key: string): readonly NotificationData[] {
  const value = data[key]
  if (!Array.isArray(value)) return []
  return value.filter(
    (entry): entry is NotificationData =>
      entry !== null && typeof entry === 'object' && !Array.isArray(entry),
  )
}

function str(data: NotificationData, key: string, fallback = ''): string {
  const value = data[key]
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return fallback
}

function num(data: NotificationData, key: string, fallback = 0): number {
  const value = data[key]
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function points(t: Translator, value: number): string {
  return t.t('notification.render.points', { count: value })
}

const DIGEST_CADENCE_KEYS = {
  daily: 'notification.render.digest.daily',
  weekly: 'notification.render.digest.weekly',
} as const

const TEMPLATES: Readonly<
  Record<string, (data: NotificationData, t: Translator) => { subject: string; body: string }>
> = {
  'warning.received': (data, t) => {
    const title = str(data, 'title', t.t('notification.render.warning.fallbackTitle'))
    const reason = str(data, 'reason')
    const total = num(data, 'totalPoints')
    const restriction = str(data, 'restriction')

    const consequence =
      restriction === 'suspend_posting'
        ? ` ${t.t('notification.render.warning.suspendPosting')}`
        : restriction === 'moderate_posting'
          ? ` ${t.t('notification.render.warning.moderatePosting')}`
          : restriction === 'ban'
            ? ` ${t.t('notification.render.warning.banned')}`
            : ''

    return {
      subject: t.t('notification.render.warning.subject', { title }),
      body:
        t.t('notification.render.warning.body', {
          points: points(t, num(data, 'points')),
          total: points(t, total),
        }) +
        consequence +
        (reason === '' ? '' : `\n\n${t.t('notification.render.warning.reason', { reason })}`),
    }
  },

  'report.actioned': (data, t) => {
    const outcome = str(data, 'outcome')
    const label = str(data, 'targetLabel', t.t('notification.render.report.fallbackLabel'))
    return {
      subject:
        outcome === 'rejected'
          ? t.t('notification.render.report.rejectedSubject')
          : t.t('notification.render.report.actionedSubject'),
      body:
        outcome === 'rejected'
          ? t.t('notification.render.report.rejectedBody', { label })
          : t.t('notification.render.report.actionedBody', { label }),
    }
  },

  'subscription.reply': (data, t) => {
    const title = str(data, 'threadTitle', t.t('notification.render.reply.fallbackTitle'))
    const posts = num(data, 'posts', 1)
    const author = str(data, 'lastAuthor')

    return {
      subject: t.t('notification.render.reply.subject', { count: posts, title }),
      body:
        author === ''
          ? t.t('notification.render.reply.noAuthor')
          : t.t('notification.render.reply.author', { author }),
    }
  },

  'subscription.digest': (data, t) => {
    const cadence = str(data, 'cadence') === 'weekly' ? 'weekly' : 'daily'
    const threadCount = num(data, 'threadCount')
    const postCount = num(data, 'postCount')
    const more = num(data, 'more')

    const lines = objects(data, 'threads').map((thread) => {
      const posts = num(thread, 'posts', 1)
      const author = str(thread, 'lastAuthor')
      return t.t('notification.render.digest.entry', {
        title: str(thread, 'title', t.t('notification.render.digest.fallbackTitle')),
        count: posts,
        author: author === '' ? '' : t.t('notification.render.digest.entryAuthor', { author }),
      })
    })

    if (more > 0) lines.push(t.t('notification.render.digest.more', { count: more }))

    return {
      subject: t.t('notification.render.digest.subject', {
        cadence: t.t(DIGEST_CADENCE_KEYS[cadence]),
        posts: postCount,
        threads: threadCount,
      }),
      body: lines.join('\n'),
    }
  },

  'post.mentioned': (data, t) => {
    const by = str(data, 'byUsername', t.t('notification.render.somebody'))
    const title = str(data, 'threadTitle', t.t('notification.render.threadFallback'))
    return {
      subject: t.t('notification.render.mentioned.subject', { by, title }),
      body: t.t('notification.render.mentioned.body', { by, title }),
    }
  },

  'post.quoted': (data, t) => {
    const by = str(data, 'byUsername', t.t('notification.render.somebody'))
    const title = str(data, 'threadTitle', t.t('notification.render.threadFallback'))
    return {
      subject: t.t('notification.render.quoted.subject', { by, title }),
      body: t.t('notification.render.quoted.body', { by, title }),
    }
  },

  'pm.received': (data, t) => {
    const from = str(data, 'fromUsername', t.t('notification.render.somebody'))
    const subject = str(data, 'subject', t.t('notification.render.pm.fallbackSubject'))
    return {
      subject: t.t('notification.render.pm.receivedSubject', { from }),
      body: `“${subject}”`,
    }
  },

  'pm.receipt': (data, t) => {
    const by = str(data, 'byUsername', t.t('notification.render.pm.recipientFallback'))
    const subject = str(data, 'subject', t.t('notification.render.pm.messageFallback'))
    return {
      subject: t.t('notification.render.pm.receiptSubject', { by }),
      body: t.t('notification.render.pm.receiptBody', { subject }),
    }
  },

  'system.task_failed': (data, t) => {
    const taskId = str(data, 'taskId', t.t('notification.render.task.fallbackId'))
    const error = str(data, 'error')
    return {
      subject: t.t('notification.render.task.subject', { taskId }),
      body:
        t.t('notification.render.task.body', { taskId }) +
        (error === '' ? '' : `\n\n${t.t('notification.render.task.error', { error })}`),
    }
  },
}

export function renderNotification(
  record: NotificationRecord,
  t: Translator = sourceTranslator(EN_CATALOG),
): NotificationView {
  const template = TEMPLATES[record.kind]
  const spec = notificationKind(record.kind)

  const rendered =
    template !== undefined
      ? template(record.data, t)
      : record.kind.startsWith('plugin.')
        ? {
            subject: str(record.data, 'subject', t.t('notification.render.pluginFallback')),
            body: str(record.data, 'body'),
          }
        : {
            subject:
              spec?.titleKey === undefined
                ? (spec?.title ?? t.t('notification.render.generic', { kind: record.kind }))
                : t.t(spec.titleKey),
            body: '',
          }

  const subject =
    record.occurrences > 1
      ? t.t('notification.render.occurrences', {
          subject: rendered.subject,
          count: record.occurrences,
        })
      : rendered.subject

  const unsubscribe = record.data.unsubscribe

  return {
    id: record.id,
    subject,
    body: rendered.body,
    unsubscribeToken: typeof unsubscribe === 'string' && unsubscribe !== '' ? unsubscribe : null,
    href: record.href,
    kind: record.kind,
    occurrences: record.occurrences,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    isRead: record.readAt !== null,
  }
}
