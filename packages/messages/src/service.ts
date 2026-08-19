import { ForbiddenError, NotFoundError, ValidationError } from '@meith/core'
import { msg } from '@meith/i18n'
import {
  authorRef,
  type BoardVocabulary,
  CORE_RENDERING,
  EMPTY_VOCABULARY,
  type MarkdownPipeline,
  quoteBlock,
  renderThrough,
  sourceAsMarkdown,
  vocabularyOptions,
} from '@meith/markdown'

import {
  BODY_MAX,
  type FolderCounts,
  MAX_RECIPIENTS,
  type MessageDetail,
  type MessageFolder,
  type MessageListRow,
  type MessageNotifierPort,
  type MessagePolicy,
  type MessageRepository,
  type PrivateMessage,
  type ResolvedRecipient,
  SUBJECT_MAX,
} from './types'

export const MESSAGES_PAGE_SIZE = 25

export interface SendInput {
  readonly authorUserId: number
  readonly authorUsername: string
  readonly to: string
  readonly bcc?: string
  readonly subject: string
  readonly message: string
  readonly receiptRequested?: boolean
  readonly replyToId?: number | null
}

export interface Draft {
  readonly to: string
  readonly subject: string
  readonly message: string
  readonly replyToId: number | null
}

/**
 * Where a plugin sees a private message. `before` may rewrite it or return null
 * to drop it; `sent` is told what was stored.
 */
export interface MessageAudit {
  readonly before: (input: {
    readonly senderId: number
    readonly recipientIds: readonly number[]
    readonly subject: string
    readonly body: string
  }) => Promise<{
    readonly senderId: number
    readonly recipientIds: readonly number[]
    readonly subject: string
    readonly body: string
  } | null>
  readonly sent: (input: {
    readonly messageId: number
    readonly recipientIds: readonly number[]
  }) => Promise<void>
}

export const NO_MESSAGE_AUDIT: MessageAudit = {
  before: async (input) => input,
  sent: async () => {},
}

/**
 * What `send` answers when a plugin suppressed the message. The sender is not
 * told, which is the point: a spam filter that announces itself is a spam
 * filter somebody tunes against.
 */
export const SUPPRESSED = 0

export class MessageService {
  private readonly repository: MessageRepository
  private readonly policy: MessagePolicy
  private readonly notifier: MessageNotifierPort | null
  private readonly now: () => Date
  private readonly vocabulary: () => Promise<BoardVocabulary>
  private readonly rendering: MarkdownPipeline
  private readonly audit: MessageAudit

  constructor(deps: {
    messages: MessageRepository
    policy: MessagePolicy
    notifier?: MessageNotifierPort | null
    now?: () => Date
    vocabulary?: () => Promise<BoardVocabulary>
    rendering?: MarkdownPipeline
    audit?: MessageAudit
  }) {
    this.repository = deps.messages
    this.policy = deps.policy
    this.notifier = deps.notifier ?? null
    this.now = deps.now ?? (() => new Date())
    this.vocabulary = deps.vocabulary ?? (async () => EMPTY_VOCABULARY)
    this.rendering = deps.rendering ?? CORE_RENDERING
    this.audit = deps.audit ?? NO_MESSAGE_AUDIT
  }

  async list(input: {
    readonly userId: number
    readonly folder: MessageFolder
    readonly before?: number | undefined
    readonly offset?: number | undefined
  }): Promise<{ rows: readonly MessageListRow[]; nextBefore: number | null }> {
    const rows = await this.repository.list({
      userId: input.userId,
      folder: input.folder,
      limit: MESSAGES_PAGE_SIZE + 1,
      before: input.before,
      offset: input.offset,
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

  async open(input: { messageId: number; userId: number }): Promise<MessageDetail> {
    const detail = await this.repository.detail(input)
    if (detail === null) throw new NotFoundError(msg('error.messages.such-message'))

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

  private visibleParticipants(
    detail: MessageDetail,
    userId: number,
  ): { participants: MessageDetail['participants']; me: string } {
    const isAuthor = detail.message.authorUserId === userId
    const me = detail.participants.find((p) => p.userId === userId)

    return {
      participants: detail.participants.filter(
        (participant) => participant.role !== 'bcc' || isAuthor || participant.userId === userId,
      ),
      me: me?.username ?? '',
    }
  }

  async send(input: SendInput): Promise<number> {
    const subject = input.subject.trim()
    const message = input.message.trim()

    if (subject === '') throw new ValidationError(msg('error.messages.message-needs-subject'))
    if (subject.length > SUBJECT_MAX) {
      throw new ValidationError(msg('error.messages.subject-length', { max: SUBJECT_MAX }))
    }
    if (message === '') throw new ValidationError(msg('error.messages.message-needs-something'))
    if (message.length > BODY_MAX) {
      throw new ValidationError(msg('error.messages.body-length', { max: BODY_MAX }))
    }

    const resolved = await this.resolveRecipients(input)
    await this.assertRoomFor(input.authorUserId, resolved)

    const proposed = await this.audit.before({
      senderId: input.authorUserId,
      recipientIds: resolved.map((recipient) => recipient.userId as number),
      subject,
      body: message,
    })
    if (proposed === null) return SUPPRESSED

    /*
     * Only the recipients the board already resolved survive: a plugin may
     * take one off the list, and cannot put one on it, because the addressees
     * are the sender's choice and the board's check, not a plugin's.
     */
    const kept = new Set(proposed.recipientIds)
    const recipients = resolved.filter((recipient) => kept.has(recipient.userId as number))
    if (recipients.length === 0) return SUPPRESSED

    const vocabulary = await this.vocabulary()
    const rendered = await renderThrough(
      this.rendering,
      proposed.body,
      { source: 'pm', viewer: authorRef(input.authorUserId) },
      vocabularyOptions(vocabulary),
    )
    const at = this.now()

    const messageId = await this.repository.send({
      authorUserId: input.authorUserId,
      authorUsername: input.authorUsername,
      subject: proposed.subject,
      message: proposed.body,
      messageHtml: rendered.html,
      renderVersion: rendered.version,
      vocabVersion: vocabulary.revision,
      replyToId: input.replyToId ?? null,
      receiptRequested: input.receiptRequested === true,
      recipients: recipients.map((r) => ({ userId: r.userId as number, bcc: r.bcc })),
      at,
    })

    await this.audit.sent({
      messageId,
      recipientIds: recipients.map((recipient) => recipient.userId as number),
    })

    for (const recipient of recipients) {
      await this.notify(() =>
        this.notifier?.messageReceived({
          userId: recipient.userId as number,
          messageId,
          fromUsername: input.authorUsername,
          subject: proposed.subject,
        }),
      )
    }

    return messageId
  }

  private async resolveRecipients(input: SendInput): Promise<readonly ResolvedRecipient[]> {
    const named = [
      ...splitNames(input.to).map((name) => ({ name, bcc: false })),
      ...splitNames(input.bcc ?? '').map((name) => ({ name, bcc: true })),
    ]

    if (named.length === 0)
      throw new ValidationError(msg('error.messages.name-at-least-one-recipient'))

    const seen = new Map<string, { name: string; bcc: boolean }>()
    for (const entry of named) {
      const key = entry.name.toLowerCase()
      const existing = seen.get(key)
      if (existing === undefined) seen.set(key, entry)
      else if (!entry.bcc) seen.set(key, entry)
    }

    if (seen.size > MAX_RECIPIENTS) {
      throw new ValidationError(
        msg('error.messages.recipient-limit', { max: MAX_RECIPIENTS, count: seen.size }),
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
        msg('error.messages.unknown-recipients', {
          count: unknown.length,
          names: unknown.join(', '),
        }),
      )
    }

    if (resolved.some((r) => r.userId === input.authorUserId)) {
      throw new ValidationError(msg('error.messages.send-message-yourself'))
    }

    return resolved
  }

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
      throw new ForbiddenError(msg('error.messages.message-store-full-delete-some'))
    }

    const full: string[] = []
    const closed: string[] = []
    for (const recipient of recipients) {
      const limit = limitById.get(recipient.userId as number)
      if (limit === undefined) continue

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
        msg('error.messages.recipients-closed', { names: closed.join(', ') }),
      )
    }
    if (full.length > 0) {
      throw new ForbiddenError(
        msg('error.messages.recipients-full', { count: full.length, names: full.join(', ') }),
      )
    }
  }

  markRead(userId: number, copyIds: readonly number[]): Promise<number> {
    return this.repository.setRead({ userId, copyIds, at: this.now() })
  }

  markUnread(userId: number, copyIds: readonly number[]): Promise<number> {
    return this.repository.setRead({ userId, copyIds, at: null })
  }

  move(userId: number, copyIds: readonly number[], folder: MessageFolder): Promise<number> {
    return this.repository.move({ userId, copyIds, folder })
  }

  remove(userId: number, copyIds: readonly number[]): Promise<number> {
    return this.repository.remove({ userId, copyIds })
  }

  emptyTrash(userId: number): Promise<number> {
    return this.repository.emptyFolder({ userId, folder: 'trash' })
  }

  async replyDraft(input: { messageId: number; userId: number }): Promise<Draft> {
    const detail = await this.repository.detail(input)
    if (detail === null) throw new NotFoundError(msg('error.messages.such-message'))

    return {
      to: detail.message.authorUsername,
      subject: prefixed('Re: ', detail.message.subject),
      message: quoted(detail.message),
      replyToId: detail.message.id,
    }
  }

  async forwardDraft(input: { messageId: number; userId: number }): Promise<Draft> {
    const detail = await this.repository.detail(input)
    if (detail === null) throw new NotFoundError(msg('error.messages.such-message'))

    return {
      to: '',
      subject: prefixed('Fw: ', detail.message.subject),
      message: quoted(detail.message),
      replyToId: null,
    }
  }

  forReport(messageId: number): Promise<PrivateMessage | null> {
    return this.repository.forReport(messageId)
  }

  private async notify(run: () => Promise<void> | undefined): Promise<void> {
    try {
      await run()
    } catch {
      /* ignore */
    }
  }
}

function isFull(quota: number, stored: number): boolean {
  return quota > 0 && stored >= quota
}

export function splitNames(raw: string): readonly string[] {
  return raw
    .split(/[,;\n]/)
    .map((name) => name.trim())
    .filter((name) => name !== '')
}

function prefixed(prefix: string, subject: string): string {
  const already = subject.slice(0, prefix.length).toLowerCase() === prefix.toLowerCase()
  const next = already ? subject : `${prefix}${subject}`
  return next.slice(0, SUBJECT_MAX)
}

function quoted(message: PrivateMessage): string {
  return `${quoteBlock({
    author: message.authorUsername,
    markdown: sourceAsMarkdown(message.message, message.bodyFormat),
  })}\n\n`
}
