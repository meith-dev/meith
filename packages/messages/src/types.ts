/**
 * F60 — what a private message is.
 *
 * The shape follows one decision made in the migration: **the message is stored
 * once, and each participant owns a copy of it.** A copy is where "which folder
 * is it in" and "have I read it" live; the message is where the subject and the
 * body live. Almost everything below is one or the other, and keeping them
 * apart is what makes quota count something a member can actually delete.
 *
 * A domain package in the R2 sense: interfaces in, no SQL, no Next. It does not
 * know about groups either — the quota and the "may they use PMs at all"
 * question are answered by `@meith/authorization` and handed here as numbers
 * and booleans (F20).
 */

/** The three system folders. Drafts are F44's; custom folders are F71's. */
export const MESSAGE_FOLDERS = ['inbox', 'sent', 'trash'] as const
export type MessageFolder = (typeof MESSAGE_FOLDERS)[number]

/**
 * What a copy records.
 *
 * Not the same question as which folder it is in: a sender who moves their Sent
 * copy to the trash is still the author, and a bcc recipient is still a
 * recipient whose name the others must not see.
 */
export const MESSAGE_ROLES = ['author', 'to', 'bcc'] as const
export type MessageRole = (typeof MESSAGE_ROLES)[number]

export function parseFolder(value: string): MessageFolder | null {
  return MESSAGE_FOLDERS.includes(value as MessageFolder) ? (value as MessageFolder) : null
}

export const SUBJECT_MAX = 200
export const BODY_MAX = 20_000
/** How many people one message may be addressed to. */
export const MAX_RECIPIENTS = 10

/** The message itself, without anybody's copy state. */
export interface PrivateMessage {
  readonly id: number
  readonly authorUserId: number | null
  /** Captured, so a deleted account's message stays readable. */
  readonly authorUsername: string
  readonly subject: string
  /** Raw BBCode. `messageHtml`/`renderVersion` are F36's cache of it. */
  readonly message: string
  readonly messageHtml: string | null
  readonly renderVersion: number
  /** The board vocabulary that cache was made with (F71). */
  readonly vocabVersion: number
  readonly replyToId: number | null
  readonly receiptRequested: boolean
  readonly sentAt: Date
}

/** One person's copy. */
export interface MessageCopy {
  readonly id: number
  readonly messageId: number
  readonly ownerUserId: number
  readonly folder: MessageFolder
  readonly role: MessageRole
  /** Null means unread. */
  readonly readAt: Date | null
}

/** A row of a folder listing: the copy, plus what it takes to render a line. */
export interface MessageListRow {
  readonly copyId: number
  readonly messageId: number
  readonly folder: MessageFolder
  readonly role: MessageRole
  readonly subject: string
  readonly sentAt: Date
  readonly readAt: Date | null
  /**
   * Who to show in the "from"/"to" column.
   *
   * Resolved by the repository because it differs by folder — the inbox shows
   * the author, the sent folder shows the recipients — and doing it per row in
   * the caller would be a query per row.
   */
  readonly counterparties: readonly string[]
  /** True when the sent copy's recipient list was longer than `counterparties`. */
  readonly moreCounterparties: number
}

/** One participant, as the sender's tracking view shows them. */
export interface MessageParticipant {
  readonly userId: number
  readonly username: string
  readonly role: MessageRole
  readonly readAt: Date | null
}

/** A message opened by somebody who holds a copy of it. */
export interface MessageDetail {
  readonly message: PrivateMessage
  readonly copy: MessageCopy
  /**
   * Everyone on the message, **already filtered for this viewer**: a bcc
   * recipient is visible to the author and to themselves, and to nobody else.
   * The filtering happens in the service, not here.
   */
  readonly participants: readonly MessageParticipant[]
}

/** What the folder tabs need, in one read rather than four counts. */
export interface FolderCounts {
  readonly inbox: number
  readonly sent: number
  readonly trash: number
  readonly unread: number
  /** Every copy this member owns, which is what quota is measured against. */
  readonly stored: number
}

/**
 * A recipient the sender named, resolved against the account store.
 *
 * `userId` null means "no such member" — carried rather than thrown so the
 * compose screen can name every bad recipient at once instead of one per
 * submit.
 */
export interface ResolvedRecipient {
  readonly name: string
  readonly userId: number | null
  readonly bcc: boolean
}

/**
 * What the service needs to know about the people involved, supplied by the
 * app because it needs the account store and the Authorizer.
 */
export interface MessagePolicy {
  /** Look a member up by name. Null when there is no such member. */
  lookup(username: string): Promise<{ id: number; username: string } | null>
  /**
   * How many messages this member may keep, and whether they may receive at
   * all. `quota` 0 means unlimited, matching every numeric permission (R4.2).
   */
  limitsFor(userId: number): Promise<{ quota: number; canReceive: boolean }>

  /**
   * Does `ownerUserId` refuse messages from `senderUserId`? (F61)
   *
   * Optional, so a board without relations — or a caller that has not wired
   * them — behaves as it did before: nobody blocks anybody. Absent means no,
   * which is the only safe default for a *permissive* answer to compute.
   */
  blocks?(ownerUserId: number, senderUserId: number): Promise<boolean>
}

export interface MessageRepository {
  /** One member's copies in one folder, newest first. */
  list(input: {
    readonly userId: number
    readonly folder: MessageFolder
    readonly limit: number
    readonly before?: number | undefined
  }): Promise<readonly MessageListRow[]>

  counts(userId: number): Promise<FolderCounts>

  /** How many copies each of these members holds, for the quota check. */
  storedCounts(userIds: readonly number[]): Promise<ReadonlyMap<number, number>>

  /**
   * One message, only if this member holds a copy of it.
   *
   * Ownership is part of the *query*, not a check the caller performs on the
   * result: a read that could return somebody else's message and rely on being
   * filtered afterwards is one refactor away from not being.
   */
  detail(input: {
    readonly messageId: number
    readonly userId: number
  }): Promise<MessageDetail | null>

  /** The message and its copies, in one transaction. Returns the new id. */
  send(input: {
    readonly authorUserId: number
    readonly authorUsername: string
    readonly subject: string
    readonly message: string
    readonly messageHtml: string
    readonly renderVersion: number
    readonly vocabVersion: number
    readonly replyToId: number | null
    readonly receiptRequested: boolean
    readonly recipients: readonly { userId: number; bcc: boolean }[]
    readonly at: Date
  }): Promise<number>

  /** Mark read/unread. Scoped to this owner's copies; returns rows affected. */
  setRead(input: {
    readonly userId: number
    readonly copyIds: readonly number[]
    readonly at: Date | null
  }): Promise<number>

  /** Move copies between folders. Scoped to this owner's copies. */
  move(input: {
    readonly userId: number
    readonly copyIds: readonly number[]
    readonly folder: MessageFolder
  }): Promise<number>

  /** Delete copies outright. The message survives while anybody holds one. */
  remove(input: {
    readonly userId: number
    readonly copyIds: readonly number[]
  }): Promise<number>

  /** Empty one folder completely. Returns rows removed. */
  emptyFolder(input: {
    readonly userId: number
    readonly folder: MessageFolder
  }): Promise<number>

  /**
   * A message a report points at, with no ownership requirement (F49).
   *
   * The **only** path by which staff ever read a private message, and it is
   * reached from a report rather than from a listing: there is no "browse
   * private messages" read on this board, by construction.
   */
  forReport(messageId: number): Promise<PrivateMessage | null>
}

/** Told when a message arrives, and when a receipt is due (F55). */
export interface MessageNotifierPort {
  messageReceived(input: {
    readonly userId: number
    readonly messageId: number
    readonly fromUsername: string
    readonly subject: string
  }): Promise<void>

  receiptRead(input: {
    readonly userId: number
    readonly messageId: number
    readonly byUsername: string
    readonly subject: string
  }): Promise<void>
}
