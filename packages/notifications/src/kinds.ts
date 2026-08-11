export type NotificationAudience = 'member' | 'staff'

interface NotificationKindBase {
  readonly title: string
  readonly description: string
  readonly audience: NotificationAudience
  readonly emailByDefault: boolean
  readonly emailConfigurable: boolean
}

export const NOTIFICATION_KINDS = [
  {
    id: 'warning.received',
    title: 'You receive a warning',
    description:
      'A moderator has warned you. The notification records what it was for ' +
      'and how many points it carried.',
    audience: 'member',
    emailByDefault: true,
    emailConfigurable: true,
  },
  {
    id: 'report.actioned',
    title: 'A report you filed is closed',
    description:
      'A moderator has resolved or rejected something you reported. The ' +
      "moderator's private note is never included.",
    audience: 'member',
    emailByDefault: false,
    emailConfigurable: true,
  },
  {
    id: 'subscription.reply',
    title: 'A thread you follow gets a reply',
    description:
      'Somebody replies in a thread or forum you follow and asked to hear ' +
      'about as it happens.',
    audience: 'member',
    emailByDefault: true,
    emailConfigurable: true,
  },
  {
    id: 'subscription.digest',
    title: 'Your daily or weekly digest is ready',
    description:
      'A summary of what arrived in the threads and forums you follow on a ' +
      'digest cadence.',
    audience: 'member',
    emailByDefault: true,
    emailConfigurable: true,
  },
  {
    id: 'post.mentioned',
    title: 'Somebody mentions you in a post',
    description:
      'Somebody writes @your-name in a post. The notification links to the ' +
      'post so you can read it in place.',
    audience: 'member',
    emailByDefault: true,
    emailConfigurable: true,
  },
  {
    id: 'post.quoted',
    title: 'Somebody quotes your post',
    description:
      'Somebody carries your words into their reply with the quote button. ' +
      'The notification links to the reply that quotes you.',
    audience: 'member',
    emailByDefault: false,
    emailConfigurable: true,
  },
  {
    id: 'pm.received',
    title: 'You receive a private message',
    description:
      'Somebody sends you a private message. The notification carries who ' +
      'from and the subject, never the message itself.',
    audience: 'member',
    emailByDefault: true,
    emailConfigurable: true,
  },
  {
    id: 'pm.receipt',
    title: 'A message you asked to track is read',
    description:
      'Somebody opens a private message you sent with a read receipt ' +
      'requested. Raised once, on the first read.',
    audience: 'member',
    emailByDefault: false,
    emailConfigurable: true,
  },
  {
    id: 'system.task_failed',
    title: 'A scheduled task fails',
    description:
      'A background task raised an error. Counters, digests and search ' +
      'indexing all run this way, so a task failing silently is how a board ' +
      'drifts without anybody noticing.',
    audience: 'staff',
    emailByDefault: true,
    emailConfigurable: true,
  },
] as const satisfies readonly (NotificationKindBase & { readonly id: string })[]

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number]['id']

export type NotificationKindSpec = NotificationKindBase & { readonly id: NotificationKind }

/**
 * A kind registered at runtime rather than compiled in — a plugin's. Its id is
 * namespaced (`plugin.<plugin>.<kind>`) so it can never collide with a
 * built-in, and it behaves identically everywhere else: a line on the
 * preferences screen, a bell notification, an e-mail the member can turn off.
 */
export interface RegisteredNotificationKind extends NotificationKindBase {
  readonly id: string
}

const BY_ID = new Map<string, NotificationKindSpec>(
  NOTIFICATION_KINDS.map((kind) => [kind.id, kind as NotificationKindSpec]),
)

export function notificationKind(id: string): NotificationKindSpec | undefined {
  return BY_ID.get(id)
}

export function isNotificationKind(id: string): id is NotificationKind {
  return BY_ID.has(id)
}

export function configurableKindsFor(
  audience: NotificationAudience,
): readonly NotificationKindSpec[] {
  return NOTIFICATION_KINDS.filter(
    (kind) => kind.audience === audience && kind.emailConfigurable,
  ) as readonly NotificationKindSpec[]
}
