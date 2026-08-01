/**
 * F60 — the private message service.
 *
 * Three rules shape almost every method below.
 *
 * ## 1. Ownership is part of the query, never a check on the result
 *
 * Every read and every write takes the acting member's id and hands it to the
 * repository, which scopes the SQL by it. Nothing here fetches a message and
 * then decides whether the caller should have it — that shape works until
 * somebody moves the filter, and the failure is silent and total.
 *
 * The one exception is `forReport`, which exists so a moderator can read a
 * message somebody reported. It is reached from a report row, never from a
 * listing, and there is no "browse private messages" read on this board at all.
 *
 * ## 2. A send is all-or-nothing
 *
 * A message addressed to five people either reaches all five or none. Partial
 * delivery leaves the sender with no answer to "did it send?", and the sent
 * copy in their folder claiming it did.
 *
 * ## 3. Quota is storage, not a rate
 *
 * `maxPrivateMessagesPerDay` has existed since F22 and is a send rate. This is
 * the other half: how many messages a member may *keep*. It is checked for the
 * sender and for every recipient before anything is written, because a message
 * that lands in a full inbox is one the recipient cannot be told about.
 */
import { ForbiddenError, NotFoundError, ValidationError } from '@forum/core'
import { renderBBCode } from '@forum/bbcode'

import {
  BODY_MAX,
  MAX_RECIPIENTS,
  SUBJECT_MAX,
  type FolderCounts,
  type MessageDetail,
  type MessageFolder,
  type MessageListRow,
  type MessageNotifierPort,
  type MessagePolicy,
  type MessageRepository,
  type PrivateMessage,
  type ResolvedRecipient,
} from './types'

export const MESSAGES_PAGE_SIZE = 25

export interface SendInput {
  readonly authorUserId: number
  readonly authorUsername: string
  /** Raw, as typed: `alice, bob`. Parsed and resolved here. */
  readonly to: string
  readonly bcc?: string
  readonly subject: string
  readonly message: string
  readonly receiptRequested?: boolean
  readonly replyToId?: number | null
}

/** A composer's starting state, for reply and forward. */
export interface Draft {
  readonly to: string
  readonly subject: string
  readonly message: string
  readonly replyToId: number | null
}

export class MessageService {
  private readonly repository: MessageRepository
  private readonly policy: MessagePolicy
  private readonly notifier: MessageNotifierPort | null
  private readonly now: () => Date

  constructor(deps: {
    messages: MessageRepository
    policy: MessagePolicy
    notifier?: MessageNotifierPort | null
    now?: () => Date
  }) {
    this.repository = deps.messages
    this.policy = deps.policy
    this.notifier = deps.notifier ?? null
    this.now = deps.now ?? (() => new Date())
  }

  async list(input: {
    readonly userId: number
    readonly folder: MessageFolder
    readonly before?: number | undefined
  }): Promise<{ rows: readonly MessageListRow[]; nextBefore: number | null }> {
    /*
     * One extra row rather than a count: "is there another page" is the only
     * question the pager asks, and a COUNT over a member's whole mailbox to
     * answer it is a scan per page view. Same trick F40 uses for threads.
     */
    const rows = await this.repository.list({
      userId: input.userId,
      folder: input.folder,
      limit: MESSAGES_PAGE_SIZE + 1,
      before: input.before,
    })

    const page = rows.slice(0, MESSAGES_PAGE_SIZE)
    const last = page[page.length - 1]
    return {
      rows: page,
      nextBefore: rows.length > MESSAGES_PAGE_SIZE && last !== undefined ? last.copyId : null,
    }
  }

  counts(userId: number): Promise<FolderCounts> {
    return this.repository.counts(userId)
  }

  /**
   * Open one message.
   *
   * Reading it is what marks it read — unlike F55's notification centre, where
   * opening the *list* deliberately does not. A message is opened one at a
   * time and by choice, so there is nothing to lose track of.
   *
   * The receipt is raised on the **first** read only, and never to yourself.
   */
  async open(input: { messageId: number; userId: number }): Promise<MessageDetail> {
    const detail = await this.repository.detail(input)
    /*
     * Not found rather than forbidden, and the same answer for "no such
     * message" as for "not yours". Distinguishing them turns the id space into
     * an oracle for whether a message exists.
     */
    if (detail === null) throw new NotFoundError('No such message.')

    const visible = this.visibleParticipants(detail, input.userId)

    if (detail.copy.readAt === null && detail.copy.role !== 'author') {
      const at = this.now()
      await this.repository.setRead({ userId: input.userId, copyIds: [detail.copy.id], at })

      if (detail.message.receiptRequested && detail.message.authorUserId !== null) {
        await this.notify(() =>
          this.notifier?.receiptRead({
            userId: detail.message.authorUserId as number,
            messageId: detail.message.id,
            byUsername: visible.me,
            subject: detail.message.subject,
          }),
        )
      }

      return { ...detail, copy: { ...detail.copy, readAt: at }, participants: visible.participants }
    }

    return { ...detail, participants: visible.participants }
  }

  /**
   * Who this viewer may see on the message.
   *
   * A bcc recipient is visible to the author and to themselves. Leaking one to
   * the other recipients would defeat the only thing bcc is for, and it is the
   * kind of leak that is invisible until somebody notices they were named.
   */
  private visibleParticipants(
    detail: MessageDetail,
    userId: number,
  ): { participants: MessageDetail['participants']; me: string } {
    const isAuthor = detail.message.authorUserId === userId
    const me = detail.participants.find((p) => p.userId === userId)

    return {
      participants: detail.participants.filter(
        (participant) =>
          participant.role !== 'bcc' || isAuthor || participant.userId === userId,
      ),
      me: me?.username ?? '',
    }
  }

  /** Send one message to everybody named, or to nobody. */
  async send(input: SendInput): Promise<number> {
    const subject = input.subject.trim()
    const message = input.message.trim()

    if (subject === '') throw new ValidationError('A message needs a subject.')
    if (subject.length > SUBJECT_MAX) {
      throw new ValidationError(`A subject may be at most ${SUBJECT_MAX} characters.`)
    }
    if (message === '') throw new ValidationError('A message needs something in it.')
    if (message.length > BODY_MAX) {
      throw new ValidationError(`A message may be at most ${BODY_MAX} characters.`)
    }

    const recipients = await this.resolveRecipients(input)
    await this.assertRoomFor(input.authorUserId, recipients)

    const rendered = renderBBCode(message)
    const at = this.now()

    const messageId = await this.repository.send({
      authorUserId: input.authorUserId,
      authorUsername: input.authorUsername,
      subject,
      message,
      messageHtml: rendered.html,
      renderVersion: rendered.version,
      replyToId: input.replyToId ?? null,
      receiptRequested: input.receiptRequested === true,
      recipients: recipients.map((r) => ({ userId: r.userId as number, bcc: r.bcc })),
      at,
    })

    /*
     * After the write, like every other notification on this board (F55): a
     * message lost because the notification table was locked would be a member
     * action undone by a side effect.
     */
    for (const recipient of recipients) {
      await this.notify(() =>
        this.notifier?.messageReceived({
          userId: recipient.userId as number,
          messageId,
          fromUsername: input.authorUsername,
          subject,
        }),
      )
    }

    return messageId
  }

  /**
   * Turn the names the sender typed into ids, or refuse with all of them.
   *
   * Every failure is collected before any is reported. A composer that rejects
   * one bad name per submit is a composer somebody retypes a long message into
   * four times.
   */
  private async resolveRecipients(input: SendInput): Promise<readonly ResolvedRecipient[]> {
    const named = [
      ...splitNames(input.to).map((name) => ({ name, bcc: false })),
      ...splitNames(input.bcc ?? '').map((name) => ({ name, bcc: true })),
    ]

    if (named.length === 0) throw new ValidationError('Name at least one recipient.')

    /*
     * Deduplicated by folded name *before* the lookups, so `alice, Alice` is
     * one recipient and one query rather than a unique-constraint failure at
     * the very end of a send. A name in both To and Bcc stays in To: the
     * stricter reading of "who can see whom" is the one that cannot leak.
     */
    const seen = new Map<string, { name: string; bcc: boolean }>()
    for (const entry of named) {
      const key = entry.name.toLowerCase()
      const existing = seen.get(key)
      if (existing === undefined) seen.set(key, entry)
      else if (!entry.bcc) seen.set(key, entry)
    }

    if (seen.size > MAX_RECIPIENTS) {
      throw new ValidationError(
        `A message may go to at most ${MAX_RECIPIENTS} people. You named ${seen.size}.`,
      )
    }

    const resolved: ResolvedRecipient[] = []
    for (const entry of seen.values()) {
      const found = await this.policy.lookup(entry.name)
      resolved.push({ name: entry.name, userId: found?.id ?? null, bcc: entry.bcc })
    }

    const unknown = resolved.filter((r) => r.userId === null).map((r) => r.name)
    if (unknown.length > 0) {
      throw new ValidationError(
        unknown.length === 1
          ? `There is no member called "${unknown[0]}".`
          : `No such members: ${unknown.join(', ')}.`,
      )
    }

    if (resolved.some((r) => r.userId === input.authorUserId)) {
      /*
       * Refused rather than handled. Allowing it would mean one member holding
       * two copies of one message, which the unique index forbids — and a
       * "note to self" is a feature nobody asked this of.
       */
      throw new ValidationError('You cannot send a message to yourself.')
    }

    return resolved
  }

  /**
   * Refuse the send if the sender or any recipient has no room.
   *
   * The recipient's full box is named. It is not a secret worth keeping: the
   * alternative is a sender who believes a message was delivered and a
   * recipient who never sees it, which is the worse failure by a distance.
   */
  private async assertRoomFor(
    authorUserId: number,
    recipients: readonly ResolvedRecipient[],
  ): Promise<void> {
    const ids = [authorUserId, ...recipients.map((r) => r.userId as number)]
    const [stored, limits] = await Promise.all([
      this.repository.storedCounts(ids),
      Promise.all(ids.map(async (id) => [id, await this.policy.limitsFor(id)] as const)),
    ])

    const limitById = new Map(limits)

    const senderLimit = limitById.get(authorUserId)
    if (senderLimit !== undefined && isFull(senderLimit.quota, stored.get(authorUserId) ?? 0)) {
      throw new ForbiddenError(
        'Your message store is full. Delete some messages before sending another.',
      )
    }

    const full: string[] = []
    const closed: string[] = []
    for (const recipient of recipients) {
      const limit = limitById.get(recipient.userId as number)
      if (limit === undefined) continue

      /*
       * F61's block, folded into the same answer as "your group may not receive
       * private messages" **on purpose**. Saying "bob is ignoring you" would
       * make the send path an oracle for somebody's ignore list, and an ignore
       * list that announces itself is a thing people stop using.
       *
       * The alternative MyBB takes — accept the message and deliver it nowhere
       * — is worse than either: the sender believes they were heard.
       */
      const blocked =
        this.policy.blocks === undefined
          ? false
          : await this.policy.blocks(recipient.userId as number, authorUserId)

      if (!limit.canReceive || blocked) closed.push(recipient.name)
      else if (isFull(limit.quota, stored.get(recipient.userId as number) ?? 0)) {
        full.push(recipient.name)
      }
    }

    if (closed.length > 0) {
      throw new ForbiddenError(
        `${closed.join(', ')} cannot receive private messages.`,
      )
    }
    if (full.length > 0) {
      throw new ForbiddenError(
        full.length === 1
          ? `${full[0]}'s message store is full, so nothing was sent.`
          : `These members' message stores are full, so nothing was sent: ${full.join(', ')}.`,
      )
    }
  }

  /* ---- Mass actions. Every one is scoped to this member's own copies. ---- */

  markRead(userId: number, copyIds: readonly number[]): Promise<number> {
    return this.repository.setRead({ userId, copyIds, at: this.now() })
  }

  markUnread(userId: number, copyIds: readonly number[]): Promise<number> {
    return this.repository.setRead({ userId, copyIds, at: null })
  }

  move(userId: number, copyIds: readonly number[], folder: MessageFolder): Promise<number> {
    return this.repository.move({ userId, copyIds, folder })
  }

  /**
   * Delete outright.
   *
   * The *message* survives while anybody still holds a copy — deleting your
   * copy of a conversation must not reach into somebody else's mailbox. The
   * row goes when the last copy does, by cascade from nothing: it is simply
   * left, and F70's prune is where an orphan message belongs.
   */
  remove(userId: number, copyIds: readonly number[]): Promise<number> {
    return this.repository.remove({ userId, copyIds })
  }

  emptyTrash(userId: number): Promise<number> {
    return this.repository.emptyFolder({ userId, folder: 'trash' })
  }

  /* ---- Composing from an existing message ---- */

  /**
   * A reply, prefilled.
   *
   * Addressed to the author only, never to the other recipients: "reply all"
   * would let somebody who was bcc'd reveal themselves by accident, and a
   * message that quietly grows its audience is not what a reply button should
   * do.
   */
  async replyDraft(input: { messageId: number; userId: number }): Promise<Draft> {
    const detail = await this.repository.detail(input)
    if (detail === null) throw new NotFoundError('No such message.')

    return {
      to: detail.message.authorUsername,
      subject: prefixed('Re: ', detail.message.subject),
      message: quoted(detail.message),
      replyToId: detail.message.id,
    }
  }

  /** A forward: the same body, quoted, addressed to nobody yet. */
  async forwardDraft(input: { messageId: number; userId: number }): Promise<Draft> {
    const detail = await this.repository.detail(input)
    if (detail === null) throw new NotFoundError('No such message.')

    return {
      to: '',
      subject: prefixed('Fw: ', detail.message.subject),
      message: quoted(detail.message),
      /*
       * Null: a forward starts a new conversation with new people. Threading it
       * onto the original would show them a parent they hold no copy of.
       */
      replyToId: null,
    }
  }

  /**
   * The message a report points at (F49).
   *
   * No ownership requirement, and that is the point — see the file header.
   */
  forReport(messageId: number): Promise<PrivateMessage | null> {
    return this.repository.forReport(messageId)
  }

  /** A notification failure never unwinds the thing it was reporting. */
  private async notify(run: () => Promise<void> | undefined): Promise<void> {
    try {
      await run()
    } catch {
      /* Deliberately swallowed; the producer's work has already committed. */
    }
  }
}

/** 0 means unlimited, like every other numeric permission (R4.2). */
function isFull(quota: number, stored: number): boolean {
  return quota > 0 && stored >= quota
}

/** `alice, bob;  carol` → three names. Commas, semicolons or newlines. */
export function splitNames(raw: string): readonly string[] {
  return raw
    .split(/[,;\n]/)
    .map((name) => name.trim())
    .filter((name) => name !== '')
}

/** `Re: ` once, however many times somebody replies to a reply. */
function prefixed(prefix: string, subject: string): string {
  const already = subject.slice(0, prefix.length).toLowerCase() === prefix.toLowerCase()
  const next = already ? subject : `${prefix}${subject}`
  return next.slice(0, SUBJECT_MAX)
}

/**
 * The original, as a quote block.
 *
 * The author name is embedded in a `[quote='…']` attribute, so a username
 * containing a quote character would break out of it — hence the strip. The
 * renderer escapes what it produces, but the *source* is what a member then
 * edits, and a mangled tag there is a mangled tag forever.
 */
function quoted(message: PrivateMessage): string {
  const author = message.authorUsername.replace(/['"[\]]/g, '')
  return `[quote='${author}']${message.message}[/quote]\n\n`
}
