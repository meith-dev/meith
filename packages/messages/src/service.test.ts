import { ForbiddenError, NotFoundError, ValidationError } from '@meith/core'
import { BodyFormat } from '@meith/markdown'
import { beforeEach, describe, expect, it } from 'vitest'

import { MessageService } from './service'
import type {
  FolderCounts,
  MessageDetail,
  MessageFolder,
  MessageListRow,
  MessageNotifierPort,
  MessagePolicy,
  MessageRepository,
  MessageRole,
  PrivateMessage,
} from './types'

const IVAN = 1
const BOB = 2
const CAROL = 3

const NAMES: Readonly<Record<number, string>> = { [IVAN]: 'ivan', [BOB]: 'bob', [CAROL]: 'carol' }

interface StoredCopy {
  id: number
  messageId: number
  ownerUserId: number
  folder: MessageFolder
  role: MessageRole
  readAt: Date | null
}

class FakeRepository implements MessageRepository {
  messages: PrivateMessage[] = []
  copies: StoredCopy[] = []
  private nextId = 1

  async list(input: {
    userId: number
    folder: MessageFolder
    limit: number
    before?: number | undefined
  }): Promise<readonly MessageListRow[]> {
    return this.copies
      .filter(
        (copy) =>
          copy.ownerUserId === input.userId &&
          copy.folder === input.folder &&
          (input.before === undefined || copy.id < input.before),
      )
      .sort((a, b) => b.id - a.id)
      .slice(0, input.limit)
      .map((copy) => {
        const message = this.messages.find((m) => m.id === copy.messageId) as PrivateMessage
        return {
          copyId: copy.id,
          messageId: copy.messageId,
          folder: copy.folder,
          role: copy.role,
          subject: message.subject,
          sentAt: message.sentAt,
          readAt: copy.readAt,
          counterparties: [],
          moreCounterparties: 0,
        }
      })
  }

  async counts(userId: number): Promise<FolderCounts> {
    const mine = this.copies.filter((copy) => copy.ownerUserId === userId)
    const inFolder = (folder: MessageFolder) => mine.filter((c) => c.folder === folder).length
    return {
      inbox: inFolder('inbox'),
      sent: inFolder('sent'),
      trash: inFolder('trash'),
      unread: mine.filter((c) => c.folder === 'inbox' && c.readAt === null).length,
      stored: mine.length,
    }
  }

  async storedCounts(userIds: readonly number[]): Promise<ReadonlyMap<number, number>> {
    const out = new Map<number, number>()
    for (const id of userIds) {
      out.set(id, this.copies.filter((copy) => copy.ownerUserId === id).length)
    }
    return out
  }

  async detail(input: { messageId: number; userId: number }): Promise<MessageDetail | null> {
    const copy = this.copies.find(
      (c) => c.messageId === input.messageId && c.ownerUserId === input.userId,
    )
    if (copy === undefined) return null

    const message = this.messages.find((m) => m.id === input.messageId) as PrivateMessage
    return {
      message,
      copy: {
        id: copy.id,
        messageId: copy.messageId,
        ownerUserId: copy.ownerUserId,
        folder: copy.folder,
        role: copy.role,
        readAt: copy.readAt,
      },
      participants: this.copies
        .filter((c) => c.messageId === input.messageId)
        .map((c) => ({
          userId: c.ownerUserId,
          username: NAMES[c.ownerUserId] ?? `user${c.ownerUserId}`,
          role: c.role,
          readAt: c.readAt,
        })),
    }
  }

  async send(input: {
    authorUserId: number
    authorUsername: string
    subject: string
    message: string
    messageHtml: string
    renderVersion: number
    vocabVersion: number
    replyToId: number | null
    receiptRequested: boolean
    recipients: readonly { userId: number; bcc: boolean }[]
    at: Date
  }): Promise<number> {
    const id = this.nextId++
    this.messages.push({
      id,
      authorUserId: input.authorUserId,
      authorUsername: input.authorUsername,
      subject: input.subject,
      message: input.message,
      messageHtml: input.messageHtml,
      renderVersion: input.renderVersion,
      bodyFormat: BodyFormat.Markdown,
      vocabVersion: input.vocabVersion,
      replyToId: input.replyToId,
      receiptRequested: input.receiptRequested,
      sentAt: input.at,
    })

    this.copies.push({
      id: this.nextId++,
      messageId: id,
      ownerUserId: input.authorUserId,
      folder: 'sent',
      role: 'author',
      readAt: input.at,
    })
    for (const recipient of input.recipients) {
      this.copies.push({
        id: this.nextId++,
        messageId: id,
        ownerUserId: recipient.userId,
        folder: 'inbox',
        role: recipient.bcc ? 'bcc' : 'to',
        readAt: null,
      })
    }
    return id
  }

  private mine(userId: number, copyIds: readonly number[]): StoredCopy[] {
    return this.copies.filter((copy) => copy.ownerUserId === userId && copyIds.includes(copy.id))
  }

  async setRead(input: {
    userId: number
    copyIds: readonly number[]
    at: Date | null
  }): Promise<number> {
    const affected = this.mine(input.userId, input.copyIds)
    for (const copy of affected) copy.readAt = input.at
    return affected.length
  }

  async move(input: {
    userId: number
    copyIds: readonly number[]
    folder: MessageFolder
  }): Promise<number> {
    const affected = this.mine(input.userId, input.copyIds)
    for (const copy of affected) copy.folder = input.folder
    return affected.length
  }

  async remove(input: { userId: number; copyIds: readonly number[] }): Promise<number> {
    const affected = this.mine(input.userId, input.copyIds)
    this.copies = this.copies.filter((copy) => !affected.includes(copy))
    return affected.length
  }

  async emptyFolder(input: { userId: number; folder: MessageFolder }): Promise<number> {
    const affected = this.copies.filter(
      (copy) => copy.ownerUserId === input.userId && copy.folder === input.folder,
    )
    this.copies = this.copies.filter((copy) => !affected.includes(copy))
    return affected.length
  }

  async forReport(messageId: number): Promise<PrivateMessage | null> {
    return this.messages.find((message) => message.id === messageId) ?? null
  }
}

let repo: FakeRepository
let service: MessageService
let raised: Array<{ kind: string; userId: number }>
let quotas: Map<number, { quota: number; canReceive: boolean }>
let blocked: Set<string>

const NOW = new Date('2026-08-01T12:00:00Z')

function policy(): MessagePolicy {
  return {
    async lookup(username) {
      const entry = Object.entries(NAMES).find(
        ([, name]) => name.toLowerCase() === username.toLowerCase(),
      )
      return entry === undefined ? null : { id: Number(entry[0]), username: entry[1] }
    },
    async limitsFor(userId) {
      return quotas.get(userId) ?? { quota: 0, canReceive: true }
    },
    async blocks(ownerUserId, senderUserId) {
      return blocked.has(`${ownerUserId}:${senderUserId}`)
    },
  }
}

function notifier(): MessageNotifierPort {
  return {
    async messageReceived(input) {
      raised.push({ kind: 'pm.received', userId: input.userId })
    },
    async receiptRead(input) {
      raised.push({ kind: 'pm.receipt', userId: input.userId })
    },
  }
}

beforeEach(() => {
  repo = new FakeRepository()
  raised = []
  quotas = new Map()
  blocked = new Set()
  service = new MessageService({
    messages: repo,
    policy: policy(),
    notifier: notifier(),
    now: () => NOW,
  })
})

async function sendTo(to: string, overrides: Partial<Parameters<MessageService['send']>[0]> = {}) {
  return service.send({
    authorUserId: IVAN,
    authorUsername: 'ivan',
    to,
    subject: 'Hello',
    message: 'A message.',
    ...overrides,
  })
}

describe('sending', () => {
  it('writes the sender a sent copy and each recipient an inbox copy', async () => {
    const id = await sendTo('bob, carol')

    const folders = repo.copies
      .filter((copy) => copy.messageId === id)
      .map((copy) => [copy.ownerUserId, copy.folder, copy.role])

    expect(folders).toEqual([
      [IVAN, 'sent', 'author'],
      [BOB, 'inbox', 'to'],
      [CAROL, 'inbox', 'to'],
    ])
  })

  it("marks the sender's own copy read, so it never shows as new", async () => {
    await sendTo('bob')
    const mine = repo.copies.find((copy) => copy.ownerUserId === IVAN)
    expect(mine?.readAt).toEqual(NOW)
  })

  it('tells every recipient', async () => {
    await sendTo('bob, carol')
    expect(raised).toEqual([
      { kind: 'pm.received', userId: BOB },
      { kind: 'pm.received', userId: CAROL },
    ])
  })

  it('renders the body once and stores it with its version', async () => {
    await sendTo('bob', { message: '**loud**' })
    const message = repo.messages[0]
    expect(message?.message).toBe('**loud**')
    expect(message?.messageHtml).toContain('<strong')
    expect(message?.renderVersion).toBeGreaterThan(0)
  })

  it('names every unknown recipient at once rather than one per submit', async () => {
    await expect(sendTo('bob, nobody, alsonobody')).rejects.toThrow(
      /nobody, alsonobody/,
    )
    expect(repo.messages).toEqual([])
  })

  it('treats one name twice as one recipient', async () => {
    const id = await sendTo('bob, Bob, BOB')
    expect(repo.copies.filter((copy) => copy.messageId === id && copy.ownerUserId === BOB)).toHaveLength(1)
  })

  it('keeps a name in To when it appears in both To and Bcc', async () => {
    const id = await sendTo('bob', { bcc: 'bob' })
    const copy = repo.copies.find((c) => c.messageId === id && c.ownerUserId === BOB)
    expect(copy?.role).toBe('to')
  })

  it('refuses a message to yourself', async () => {
    await expect(sendTo('ivan')).rejects.toBeInstanceOf(ValidationError)
  })

  it('refuses an empty subject or body, and an over-long one', async () => {
    await expect(sendTo('bob', { subject: '   ' })).rejects.toBeInstanceOf(ValidationError)
    await expect(sendTo('bob', { message: '  ' })).rejects.toBeInstanceOf(ValidationError)
    await expect(sendTo('bob', { subject: 'x'.repeat(201) })).rejects.toBeInstanceOf(
      ValidationError,
    )
  })

  it('refuses naming nobody at all', async () => {
    await expect(sendTo('  ,  ')).rejects.toBeInstanceOf(ValidationError)
  })

  it('refuses more recipients than the limit', async () => {
    const many = Array.from({ length: 11 }, (_, i) => `person${i}`).join(', ')
    await expect(sendTo(many)).rejects.toThrow(/at most 10/)
  })
})

describe('quota', () => {
  it("refuses the send when a recipient's store is full, and names them", async () => {
    quotas.set(BOB, { quota: 1, canReceive: true })
    repo.copies.push({
      id: 900,
      messageId: 900,
      ownerUserId: BOB,
      folder: 'inbox',
      role: 'to',
      readAt: null,
    })

    await expect(sendTo('bob')).rejects.toThrow(/bob/)
    expect(repo.messages).toEqual([])
  })

  it('sends nothing to anybody when one of several recipients is full', async () => {
    quotas.set(CAROL, { quota: 1, canReceive: true })
    repo.copies.push({
      id: 900,
      messageId: 900,
      ownerUserId: CAROL,
      folder: 'trash',
      role: 'to',
      readAt: null,
    })

    await expect(sendTo('bob, carol')).rejects.toBeInstanceOf(ForbiddenError)
    expect(repo.copies.filter((copy) => copy.ownerUserId === BOB)).toEqual([])
  })

  it('treats quota 0 as unlimited, not as a store of zero', async () => {
    quotas.set(BOB, { quota: 0, canReceive: true })
    await expect(sendTo('bob')).resolves.toBeGreaterThan(0)
  })

  it("refuses when the sender's own store is full", async () => {
    quotas.set(IVAN, { quota: 1, canReceive: true })
    repo.copies.push({
      id: 900,
      messageId: 900,
      ownerUserId: IVAN,
      folder: 'sent',
      role: 'author',
      readAt: null,
    })

    await expect(sendTo('bob')).rejects.toThrow(/[Yy]our message store is full/)
  })

  it('refuses a recipient whose groups do not allow private messages', async () => {
    quotas.set(BOB, { quota: 0, canReceive: false })
    await expect(sendTo('bob')).rejects.toThrow(/cannot receive/)
  })
})

describe('the ignore block', () => {
  it('refuses a message to somebody who is ignoring the sender', async () => {
    blocked.add(`${BOB}:${IVAN}`)
    await expect(sendTo('bob')).rejects.toThrow(/cannot receive/)
    expect(repo.messages).toEqual([])
  })

  it('gives the same wording as a permission refusal, so it is not an oracle', async () => {
    blocked.add(`${BOB}:${IVAN}`)
    const ignoredMessage = await sendTo('bob').catch((err: Error) => err.message)

    blocked.clear()
    quotas.set(BOB, { quota: 0, canReceive: false })
    const deniedMessage = await sendTo('bob').catch((err: Error) => err.message)

    expect(ignoredMessage).toBe(deniedMessage)
  })

  it('is one-directional: the ignorer can still write to the ignored', async () => {
    blocked.add(`${BOB}:${IVAN}`)

    const id = await service.send({
      authorUserId: BOB,
      authorUsername: 'bob',
      to: 'ivan',
      subject: 'Hello',
      message: 'A message.',
    })

    expect(id).toBeGreaterThan(0)
  })

  it('sends nothing to anybody when one recipient blocks the sender', async () => {
    blocked.add(`${CAROL}:${IVAN}`)
    await expect(sendTo('bob, carol')).rejects.toThrow(/cannot receive/)
    expect(repo.copies.filter((copy) => copy.ownerUserId === BOB)).toEqual([])
  })

  it('lets everything through when the policy answers no blocks', async () => {
    await expect(sendTo('bob')).resolves.toBeGreaterThan(0)
  })
})

describe('opening a message', () => {
  it('marks it read and returns the read time', async () => {
    const id = await sendTo('bob')
    const detail = await service.open({ messageId: id, userId: BOB })
    expect(detail.copy.readAt).toEqual(NOW)
  })

  it('gives the same answer for somebody else’s message as for one that does not exist', async () => {
    const id = await sendTo('bob')
    await expect(service.open({ messageId: id, userId: CAROL })).rejects.toBeInstanceOf(
      NotFoundError,
    )
    await expect(service.open({ messageId: 4242, userId: BOB })).rejects.toBeInstanceOf(
      NotFoundError,
    )
  })

  it('raises a receipt on the first read only, and only when one was asked for', async () => {
    const id = await sendTo('bob', { receiptRequested: true })
    raised = []

    await service.open({ messageId: id, userId: BOB })
    await service.open({ messageId: id, userId: BOB })

    expect(raised).toEqual([{ kind: 'pm.receipt', userId: IVAN }])
  })

  it('raises no receipt when none was requested', async () => {
    const id = await sendTo('bob')
    raised = []
    await service.open({ messageId: id, userId: BOB })
    expect(raised).toEqual([])
  })

  it('never marks the author’s own sent copy read again, or receipts them', async () => {
    const id = await sendTo('bob', { receiptRequested: true })
    raised = []
    await service.open({ messageId: id, userId: IVAN })
    expect(raised).toEqual([])
  })

  it('hides a bcc recipient from the other recipients', async () => {
    const id = await sendTo('bob', { bcc: 'carol' })

    const asBob = await service.open({ messageId: id, userId: BOB })
    expect(asBob.participants.map((p) => p.username)).toEqual(['ivan', 'bob'])
  })

  it('shows a bcc recipient to the author and to themselves', async () => {
    const id = await sendTo('bob', { bcc: 'carol' })

    const asAuthor = await service.open({ messageId: id, userId: IVAN })
    expect(asAuthor.participants.map((p) => p.username)).toEqual(['ivan', 'bob', 'carol'])

    const asCarol = await service.open({ messageId: id, userId: CAROL })
    expect(asCarol.participants.map((p) => p.username)).toContain('carol')
  })
})

describe('folder actions', () => {
  it("acts only on the acting member's own copies", async () => {
    const id = await sendTo('bob')
    const bobsCopy = repo.copies.find((copy) => copy.ownerUserId === BOB) as StoredCopy

    expect(await service.move(CAROL, [bobsCopy.id], 'trash')).toBe(0)
    expect(bobsCopy.folder).toBe('inbox')
    expect(await service.remove(CAROL, [bobsCopy.id])).toBe(0)
    expect(repo.copies.some((copy) => copy.messageId === id && copy.ownerUserId === BOB)).toBe(true)
  })

  it('moves, marks and deletes, reporting how many rows it touched', async () => {
    const id = await sendTo('bob')
    const copy = repo.copies.find((c) => c.ownerUserId === BOB) as StoredCopy

    expect(await service.markRead(BOB, [copy.id])).toBe(1)
    expect(copy.readAt).toEqual(NOW)
    expect(await service.markUnread(BOB, [copy.id])).toBe(1)
    expect(copy.readAt).toBeNull()
    expect(await service.move(BOB, [copy.id], 'trash')).toBe(1)
    expect(copy.folder).toBe('trash')
    expect(await service.emptyTrash(BOB)).toBe(1)
    expect(repo.copies.some((c) => c.ownerUserId === BOB)).toBe(false)

    expect(repo.messages.some((m) => m.id === id)).toBe(true)
  })

  it("deleting your copy leaves everybody else's alone", async () => {
    const id = await sendTo('bob, carol')
    const bobs = repo.copies.find((c) => c.ownerUserId === BOB) as StoredCopy

    await service.remove(BOB, [bobs.id])

    expect(repo.copies.filter((c) => c.messageId === id).map((c) => c.ownerUserId)).toEqual([
      IVAN,
      CAROL,
    ])
  })
})

describe('paging', () => {
  it('reports a next cursor only when there is another page', async () => {
    for (let i = 0; i < 26; i++) await sendTo('bob', { subject: `Message ${i}` })

    const first = await service.list({ userId: BOB, folder: 'inbox' })
    expect(first.rows).toHaveLength(25)
    expect(first.nextBefore).toBe(first.rows[24]?.copyId)

    const second = await service.list({
      userId: BOB,
      folder: 'inbox',
      before: first.nextBefore as number,
    })
    expect(second.rows).toHaveLength(1)
    expect(second.nextBefore).toBeNull()
  })
})

describe('reply and forward', () => {
  it('addresses a reply to the author only, never to the other recipients', async () => {
    const id = await sendTo('bob, carol')
    const draft = await service.replyDraft({ messageId: id, userId: BOB })

    expect(draft.to).toBe('ivan')
    expect(draft.replyToId).toBe(id)
    expect(draft.subject).toBe('Re: Hello')
  })

  it('does not stack Re: on a reply to a reply', async () => {
    const id = await sendTo('bob', { subject: 'Re: Hello' })
    const draft = await service.replyDraft({ messageId: id, userId: BOB })
    expect(draft.subject).toBe('Re: Hello')
  })

  it('quotes the original, with a username that cannot reformat the attribution', async () => {
    const id = await service.send({
      authorUserId: IVAN,
      authorUsername: 'iv**an**[',
      to: 'bob',
      subject: 'Hello',
      message: 'A message.',
    })

    const draft = await service.replyDraft({ messageId: id, userId: BOB })
    expect(draft.message).toBe(
      '> **[ivan](/member/by-name/iv%2A%2Aan%2A%2A%5B) wrote:**\n>\n> A message.\n\n',
    )
  })

  it('starts a forward with no recipient and no thread', async () => {
    const id = await sendTo('bob')
    const draft = await service.forwardDraft({ messageId: id, userId: BOB })

    expect(draft.to).toBe('')
    expect(draft.subject).toBe('Fw: Hello')
    expect(draft.replyToId).toBeNull()
  })

  it('refuses to prefill from a message the member does not hold', async () => {
    const id = await sendTo('bob')
    await expect(
      service.replyDraft({ messageId: id, userId: CAROL }),
    ).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe('reporting', () => {
  it('reads a message for a report without any ownership requirement', async () => {
    const id = await sendTo('bob')
    const message = await service.forReport(id)
    expect(message?.subject).toBe('Hello')
    expect(await service.forReport(4242)).toBeNull()
  })
})
