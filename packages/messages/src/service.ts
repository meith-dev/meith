import { ForbiddenError, NotFoundError, ValidationError } from '@meith/core'
import {
  EMPTY_VOCABULARY,
  quoteBlock,
  renderMarkdown,
  sourceAsMarkdown,
  vocabularyOptions,
  type BoardVocabulary,
} from '@meith/markdown'

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

export class MessageService {
  private readonly repository: MessageRepository
  private readonly policy: MessagePolicy
  private readonly notifier: MessageNotifierPort | null
  private readonly now: () => Date
  private readonly vocabulary: () => Promise<BoardVocabulary>

  constructor(deps: {
    messages: MessageRepository
    policy: MessagePolicy
    notifier?: MessageNotifierPort | null
    now?: () => Date
    vocabulary?: () => Promise<BoardVocabulary>
  }) {
    this.repository = deps.messages
    this.policy = deps.policy
    this.notifier = deps.notifier ?? null
    this.now = deps.now ?? (() => new Date())
    this.vocabulary = deps.vocabulary ?? (async () => EMPTY_VOCABULARY)
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

    const vocabulary = await this.vocabulary()
    const rendered = renderMarkdown(message, vocabularyOptions(vocabulary))
    const at = this.now()

    const messageId = await this.repository.send({
      authorUserId: input.authorUserId,
      authorUsername: input.authorUsername,
      subject,
      message,
      messageHtml: rendered.html,
      renderVersion: rendered.version,
      vocabVersion: vocabulary.revision,
      replyToId: input.replyToId ?? null,
      receiptRequested: input.receiptRequested === true,
      recipients: recipients.map((r) => ({ userId: r.userId as number, bcc: r.bcc })),
      at,
    })

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

  private async resolveRecipients(input: SendInput): Promise<readonly ResolvedRecipient[]> {
    const named = [
      ...splitNames(input.to).map((name) => ({ name, bcc: false })),
      ...splitNames(input.bcc ?? '').map((name) => ({ name, bcc: true })),
    ]

    if (named.length === 0) throw new ValidationError('Name at least one recipient.')

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
      throw new ValidationError('You cannot send a message to yourself.')
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
      throw new ForbiddenError(
        'Your message store is full. Delete some messages before sending another.',
      )
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
    if (detail === null) throw new NotFoundError('No such message.')

    return {
      to: detail.message.authorUsername,
      subject: prefixed('Re: ', detail.message.subject),
      message: quoted(detail.message),
      replyToId: detail.message.id,
    }
  }

  async forwardDraft(input: { messageId: number; userId: number }): Promise<Draft> {
    const detail = await this.repository.detail(input)
    if (detail === null) throw new NotFoundError('No such message.')

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
