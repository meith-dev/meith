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

function points(value: number): string {
  return `${value} ${value === 1 ? 'point' : 'points'}`
}

const TEMPLATES: Readonly<
  Record<string, (data: NotificationData) => { subject: string; body: string }>
> = {
  'warning.received': (data) => {
    const title = str(data, 'title', 'a rule breach')
    const reason = str(data, 'reason')
    const total = num(data, 'totalPoints')
    const restriction = str(data, 'restriction')

    const consequence =
      restriction === 'suspend_posting'
        ? ' You cannot post while the restriction is in force.'
        : restriction === 'moderate_posting'
          ? ' Your posts will be held for approval while the restriction is in force.'
          : restriction === 'ban'
            ? ' Your account has been suspended.'
            : ''

    return {
      subject: `You have been warned: ${title}`,
      body:
        `You received a warning worth ${points(num(data, 'points'))}. ` +
        `Your total is now ${points(total)}.${consequence}` +
        (reason === '' ? '' : `\n\nReason given: ${reason}`),
    }
  },

  'report.actioned': (data) => {
    const outcome = str(data, 'outcome')
    const label = str(data, 'targetLabel', 'the content you reported')
    return {
      subject:
        outcome === 'rejected'
          ? 'A report you filed was closed without action'
          : 'A report you filed was actioned',
      body:
        outcome === 'rejected'
          ? `A moderator reviewed your report about ${label} and decided no action was needed.`
          : `A moderator reviewed your report about ${label} and has acted on it. Thank you for reporting it.`,
    }
  },

  'subscription.reply': (data) => {
    const title = str(data, 'threadTitle', 'a thread you follow')
    const posts = num(data, 'posts', 1)
    const author = str(data, 'lastAuthor')

    return {
      subject:
        posts === 1
          ? `New reply in ${title}`
          : `${posts} new replies in ${title}`,
      body:
        author === ''
          ? 'There is something new to read.'
          : `The most recent one is from ${author}.`,
    }
  },

  'subscription.digest': (data) => {
    const cadence = str(data, 'cadence', 'daily')
    const threadCount = num(data, 'threadCount')
    const postCount = num(data, 'postCount')
    const more = num(data, 'more')

    const lines = objects(data, 'threads').map((thread) => {
      const posts = num(thread, 'posts', 1)
      const author = str(thread, 'lastAuthor')
      return (
        `• ${str(thread, 'title', 'A thread')} — ${posts} ` +
        `${posts === 1 ? 'post' : 'posts'}` +
        (author === '' ? '' : `, latest from ${author}`)
      )
    })

    if (more > 0) lines.push(`• and ${more} more`)

    return {
      subject:
        `Your ${cadence === 'weekly' ? 'weekly' : 'daily'} digest: ` +
        `${postCount} ${postCount === 1 ? 'post' : 'posts'} in ` +
        `${threadCount} ${threadCount === 1 ? 'thread' : 'threads'}`,
      body: lines.join('\n'),
    }
  },

  'post.mentioned': (data) => {
    const by = str(data, 'byUsername', 'Somebody')
    const title = str(data, 'threadTitle', 'a thread')
    return {
      subject: `${by} mentioned you in ${title}`,
      body: `${by} mentioned you by name in a post in ${title}.`,
    }
  },

  'post.quoted': (data) => {
    const by = str(data, 'byUsername', 'Somebody')
    const title = str(data, 'threadTitle', 'a thread')
    return {
      subject: `${by} quoted your post in ${title}`,
      body: `${by} quoted one of your posts in a reply in ${title}.`,
    }
  },

  'pm.received': (data) => {
    const from = str(data, 'fromUsername', 'Somebody')
    const subject = str(data, 'subject', 'a private message')
    return {
      subject: `New private message from ${from}`,
      body: `“${subject}”`,
    }
  },

  'pm.receipt': (data) => {
    const by = str(data, 'byUsername', 'The recipient')
    const subject = str(data, 'subject', 'your message')
    return {
      subject: `${by} read your message`,
      body: `“${subject}” has been read.`,
    }
  },

  'system.task_failed': (data) => {
    const taskId = str(data, 'taskId', 'a scheduled task')
    const error = str(data, 'error')
    return {
      subject: `Scheduled task failed: ${taskId}`,
      body:
        `The task "${taskId}" raised an error on its last run. It will be ` +
        `retried on the next tick; a task that keeps failing needs looking at.` +
        (error === '' ? '' : `\n\nError: ${error}`),
    }
  },
}

export function renderNotification(record: NotificationRecord): NotificationView {
  const template = TEMPLATES[record.kind]
  const spec = notificationKind(record.kind)

  // A plugin kind carries its words in the data: the plugin wrote the subject
  // and body when it raised the notification, and this is where they surface —
  // on the bell and in the e-mail alike.
  const rendered =
    template !== undefined
      ? template(record.data)
      : record.kind.startsWith('plugin.')
        ? {
            subject: str(record.data, 'subject', 'A plugin has news for you'),
            body: str(record.data, 'body'),
          }
        : {
            subject: spec?.title ?? `Notification: ${record.kind}`,
            body: '',
          }

  const subject =
    record.occurrences > 1
      ? `${rendered.subject} (${record.occurrences} times)`
      : rendered.subject

  const unsubscribe = record.data['unsubscribe']

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
