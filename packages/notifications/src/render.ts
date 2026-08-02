/**
 * F55 — turning a stored notification into words.
 *
 * The wording lives here rather than in the row, so a phrasing change is a
 * deploy rather than a migration and yesterday's notifications get it too. The
 * row supplies only facts (`types.ts` explains why).
 *
 * ## Nothing in this file may throw
 *
 * Every input is untrusted in the specific sense that matters: it was written
 * by a *previous* deploy. A kind that has since been removed, a `data` object
 * missing the field this build expects, a number stored where a string is now
 * read — all reachable without anybody doing anything wrong. A notification
 * centre that 500s because one row is odd is worse in every way than one that
 * renders that row as a flat line, so the readers below fall back rather than
 * fail, and the unknown-kind case has a defined output.
 */
import { notificationKind } from './kinds'
import type { NotificationData, NotificationRecord } from './types'

/** A notification as a screen or a mail template consumes it. */
export interface NotificationView {
  readonly id: number
  /** The one-line summary. Plain text — never markup. */
  readonly subject: string
  /** The detail under it. May be empty; never markup. */
  readonly body: string
  /** Board-relative path, or null when the notification points nowhere. */
  readonly href: string | null
  readonly kind: string
  readonly occurrences: number
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly isRead: boolean
  /**
   * F56's signed one-click unsubscribe token, when the raiser captured one.
   *
   * Read from `data` rather than minted here: this package knows nothing about
   * subscriptions and must not learn. It is surfaced on the view because the
   * *mail* renderer is the only thing that needs it — an on-site notification
   * already sits next to the screen that manages the subscription.
   */
  readonly unsubscribeToken: string | null
}

/**
 * Read a list of objects without trusting any of it.
 *
 * F56's digest carries the threads it covers. Every element is filtered to a
 * plain object, so a row written by an older deploy — or an array of strings
 * where objects are now read — degrades to a shorter list rather than throwing
 * inside a page render.
 */
function objects(data: NotificationData, key: string): readonly NotificationData[] {
  const value = data[key]
  if (!Array.isArray(value)) return []
  return value.filter(
    (entry): entry is NotificationData =>
      entry !== null && typeof entry === 'object' && !Array.isArray(entry),
  )
}

/** Read a string field without trusting it to be there, or to be a string. */
function str(data: NotificationData, key: string, fallback = ''): string {
  const value = data[key]
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return fallback
}

/** Read a number field. Non-numbers become the fallback, never `NaN`. */
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

/**
 * The per-kind wording.
 *
 * A map rather than a `switch` so an unhandled kind is a missing key — which
 * `render` already has an answer for — instead of a fallthrough somebody has to
 * remember to write.
 */
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
      /*
       * What the moderator did, and nothing else. `report_events.note` is the
       * private half of F49's two audiences (D48) and must never reach the
       * reporter — which is why the note is not a field this template could
       * accidentally read: the raise path never captures it.
       */
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
      /*
       * The list is the message. A digest whose body says "you have updates"
       * and makes the reader open the board to find out what they are has not
       * digested anything.
       */
      body: lines.join('\n'),
    }
  },

  'pm.received': (data) => {
    const from = str(data, 'fromUsername', 'Somebody')
    const subject = str(data, 'subject', 'a private message')
    return {
      subject: `New private message from ${from}`,
      /*
       * The subject line, never the message. A notification row outlives the
       * thing that caused it (F55), so carrying the body would leave a copy of
       * a deleted private message sitting in the notification centre — and in
       * an e-mail the member may have declined for messages themselves.
       */
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

/**
 * Render one stored notification.
 *
 * An unknown kind renders as its own id rather than as nothing: an operator
 * looking at a member's centre after a downgrade needs to see that *something*
 * was raised, and the id is the only honest thing left to show.
 */
export function renderNotification(record: NotificationRecord): NotificationView {
  const template = TEMPLATES[record.kind]
  const spec = notificationKind(record.kind)

  const rendered =
    template === undefined
      ? {
          subject: spec?.title ?? `Notification: ${record.kind}`,
          body: '',
        }
      : template(record.data)

  /*
   * The repeat count is appended to the subject rather than stored in it,
   * because it changes every time the notification coalesces and the subject
   * does not.
   */
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
