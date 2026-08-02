/**
 * F55 — the notification kind registry.
 *
 * Every kind of notification the board can raise is named here exactly once,
 * with its audience, its default channels, and whether a member may switch its
 * e-mail off. It is data rather than a set of `if` statements for the same
 * reason `SLOTS` and `PERMISSION_FIELDS` are: three separate things have to
 * agree about the list — the preferences screen, the raise path, and the mail
 * renderer — and a list that lives in one place cannot fall out of step with
 * itself.
 *
 * ## On-site delivery is not a preference
 *
 * Every kind is delivered to the notification centre. Only *e-mail* is
 * configurable, and even then only where the registry says so.
 *
 * That is a deliberate asymmetry. The centre is the board's record of what a
 * member was told, and a member who can switch the record off can later say
 * they were never warned — with the board's own data agreeing. E-mail is a
 * delivery mechanism for the same record and can be declined freely, because
 * declining it does not erase anything.
 *
 * ## Kinds are added when they have a producer
 *
 * The three below are the three the board can actually raise today. Naming
 * `pm.received` here before F60 has a `private_messages` table would put a row
 * on the preferences screen that can never fire — the same "never advertise a
 * capability that is not there" rule the task registry follows (D32).
 */

/** Who a kind is aimed at. Decides whose preferences screen lists it. */
export type NotificationAudience = 'member' | 'staff'

/**
 * A kind, minus its id.
 *
 * Split from `NotificationKindSpec` because the id union is *derived* from the
 * registry below, and a registry annotated with a type that depends on itself
 * does not compile. This is the same shape `SLOTS` uses for the same reason.
 */
interface NotificationKindBase {
  /** The preferences screen's label. */
  readonly title: string
  /** What the member is agreeing to receive. Shown under the label. */
  readonly description: string
  readonly audience: NotificationAudience
  /** Whether e-mail is on for somebody who has never visited the screen. */
  readonly emailByDefault: boolean
  /**
   * Whether the member may turn e-mail off.
   *
   * Every kind today is configurable. The field exists because the first
   * account-security notification (F57's "your e-mail address was changed")
   * must not be, and the alternative to declaring that is a special case
   * hard-coded into the save path.
   */
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
    /*
     * On by default, and the one kind where that matters most: a warning can
     * suspend posting, and F53's restriction is otherwise discovered by trying
     * to post and being refused — which is how a member concludes the board is
     * broken rather than that they were disciplined.
     */
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
    /*
     * Off by default. The reporter has already been told the report was
     * received; a second message about somebody else's content is not something
     * to opt somebody into, and reporting is exactly the act a member repeats.
     */
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
    /*
     * On by default: following a thread is an explicit request to be told, and
     * the member who does not want e-mail about it has two ways out — this
     * switch, or the digest cadence on the subscription itself.
     */
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
    /*
     * On by default, and the one kind where switching e-mail off is nearly a
     * contradiction: a digest exists to be sent. It stays configurable because
     * the on-site summary is still worth having for somebody who reads the
     * board daily and wants no mail at all.
     */
    emailByDefault: true,
    emailConfigurable: true,
  },
  {
    id: 'pm.received',
    title: 'You receive a private message',
    description:
      'Somebody sends you a private message. The notification carries who ' +
      'from and the subject, never the message itself.',
    audience: 'member',
    /*
     * On by default. A private message is addressed to one person and is the
     * one kind nobody else will mention to them — MyBB's "e-mail notification
     * of new PM" is on by default for the same reason.
     *
     * The body is deliberately not carried: a notification row survives the
     * deletion of what caused it (F55), and a member who deletes a message
     * should not find its text still sitting in their notification centre.
     */
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
    /*
     * Off by default. The sender already asked to be told and can see the read
     * time on the message itself; a mail for each of five recipients opening
     * one announcement is a mailbox full of nothing.
     */
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
    /*
     * On by default. An operational alert nobody sees is not an alert, and an
     * administrator who does not want them can say so on the screen — which is
     * a different thing from never having been offered.
     */
    emailByDefault: true,
    emailConfigurable: true,
  },
] as const satisfies readonly (NotificationKindBase & { readonly id: string })[]

/** Every kind's id. Derived from the registry — never hand-written. */
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number]['id']

/** One registry entry, with its id narrowed to the derived union. */
export type NotificationKindSpec = NotificationKindBase & { readonly id: NotificationKind }

const BY_ID = new Map<string, NotificationKindSpec>(
  NOTIFICATION_KINDS.map((kind) => [kind.id, kind as NotificationKindSpec]),
)

/**
 * Look a kind up without trusting the input.
 *
 * `notifications.kind` is text, so a row written by a deploy that knew a kind
 * this build has removed will arrive here. Returning `undefined` rather than
 * throwing is what lets the centre render that row as a plain line instead of
 * failing the whole page — see `render.ts`.
 */
export function notificationKind(id: string): NotificationKindSpec | undefined {
  return BY_ID.get(id)
}

/** Narrow an arbitrary string to a known kind. */
export function isNotificationKind(id: string): id is NotificationKind {
  return BY_ID.has(id)
}

/** The kinds one audience may configure, in registry order. */
export function configurableKindsFor(
  audience: NotificationAudience,
): readonly NotificationKindSpec[] {
  return NOTIFICATION_KINDS.filter(
    (kind) => kind.audience === audience && kind.emailConfigurable,
  ) as readonly NotificationKindSpec[]
}
