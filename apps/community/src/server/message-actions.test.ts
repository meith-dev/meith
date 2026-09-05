import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Actor } from '@meith/authorization'
import { combinePermissionSets, InMemoryAuthorizationSource } from '@meith/authorization'
import { BodyFormat } from '@meith/markdown'
import type {
  FolderCounts,
  MessageDetail,
  MessageFolder,
  MessageListRow,
  MessageRepository,
  MessageRole,
  PrivateMessage,
} from '@meith/messages'

import type * as Antispam from './antispam'

const { RedirectError } = vi.hoisted(() => {
  class RedirectError extends Error {
    constructor(readonly location: string) {
      super(`redirect: ${location}`)
    }
  }
  return { RedirectError }
})

vi.mock('next/navigation', () => ({
  redirect: (to: string): never => {
    throw new RedirectError(to)
  },
}))

const actorRef: { current: Actor | null } = { current: null }
vi.mock('./context', () => ({ getActor: async () => actorRef.current }))

const daily = vi.hoisted(() => ({
  outcome: null as { allowed: false; used: number; retryAfterSeconds: number } | null,
}))
vi.mock('./antispam', async (importOriginal) => ({
  ...(await importOriginal<typeof Antispam>()),
  spendDailyLimit: async () => daily.outcome,
}))

const { messageBulkAction, sendMessageAction } = await import('./message-actions')
const { EMPTY_STATE } = await import('./auth-form-state')
const { SEED_BOARD, SEED_GROUP } = await import('./seed-board')
const { installTestContainer } = await import('./test-container')

const IVAN = 1
const BOB = 2

interface StoredCopy {
  id: number
  messageId: number
  ownerUserId: number
  folder: MessageFolder
  role: MessageRole
  readAt: Date | null
}

class FakeMessages implements MessageRepository {
  messages: PrivateMessage[] = []
  copies: StoredCopy[] = []
  private nextId = 1

  async list(): Promise<readonly MessageListRow[]> {
    return []
  }
  async counts(userId: number): Promise<FolderCounts> {
    const mine = this.copies.filter((copy) => copy.ownerUserId === userId)
    return { inbox: mine.length, sent: 0, trash: 0, unread: 0, stored: mine.length }
  }
  async storedCounts(userIds: readonly number[]): Promise<ReadonlyMap<number, number>> {
    return new Map(
      userIds.map((id) => [id, this.copies.filter((c) => c.ownerUserId === id).length]),
    )
  }
  async detail(): Promise<MessageDetail | null> {
    return null
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
  private mine(userId: number, copyIds: readonly number[]) {
    return this.copies.filter((c) => c.ownerUserId === userId && copyIds.includes(c.id))
  }
  async setRead(input: { userId: number; copyIds: readonly number[]; at: Date | null }) {
    const affected = this.mine(input.userId, input.copyIds)
    for (const copy of affected) copy.readAt = input.at
    return affected.length
  }
  async move(input: { userId: number; copyIds: readonly number[]; folder: MessageFolder }) {
    const affected = this.mine(input.userId, input.copyIds)
    for (const copy of affected) copy.folder = input.folder
    return affected.length
  }
  async restore(input: { userId: number; copyIds: readonly number[] }) {
    const affected = this.mine(input.userId, input.copyIds).filter((c) => c.folder === 'trash')
    for (const copy of affected) copy.folder = copy.role === 'author' ? 'sent' : 'inbox'
    return affected.length
  }
  async remove(input: { userId: number; copyIds: readonly number[] }) {
    const affected = this.mine(input.userId, input.copyIds)
    this.copies = this.copies.filter((c) => !affected.includes(c))
    return affected.length
  }
  async emptyFolder(input: { userId: number; folder: MessageFolder }) {
    const affected = this.copies.filter(
      (c) => c.ownerUserId === input.userId && c.folder === input.folder,
    )
    this.copies = this.copies.filter((c) => !affected.includes(c))
    return affected.length
  }
  async forReport(): Promise<PrivateMessage | null> {
    return null
  }
}

let messages: FakeMessages

async function actorFor(groupId: number, userId: number | null): Promise<Actor> {
  const source = new InMemoryAuthorizationSource(SEED_BOARD)
  const defaults = await source.groupDefaults([groupId])
  return {
    userId,
    groupIds: [groupId],
    primaryGroupId: groupId,
    state: userId === null ? 'guest' : 'active',
    global: combinePermissionSets(defaults.map((d) => d.permissions)),
    permissionVersion: 1,
  }
}

function form(entries: Array<[string, string]>): FormData {
  const data = new FormData()
  for (const [key, value] of entries) data.append(key, value)
  return data
}

async function run(
  action: (prev: typeof EMPTY_STATE, form: FormData) => Promise<typeof EMPTY_STATE>,
  data: FormData,
): Promise<{ redirectedTo?: string; error?: string; values?: Record<string, string> }> {
  try {
    const state = await action(EMPTY_STATE, data)
    return state.error === undefined
      ? {}
      : { error: state.error, ...(state.values === undefined ? {} : { values: state.values }) }
  } catch (err) {
    if (err instanceof RedirectError) return { redirectedTo: err.location }
    throw err
  }
}

async function install(): Promise<void> {
  const container = installTestContainer({ container: { messages } })
  const store = container.accountStore as {
    accounts: { create(input: Record<string, unknown>): Promise<{ id: number }> }
  }

  const { hashPassword } = await import('@meith/accounts')
  const hash = await hashPassword('correct horse battery staple')
  for (const name of ['ivan', 'bob']) {
    await store.accounts.create({
      username: name,
      usernameLower: name,
      email: `${name}@example.test`,
      emailLower: `${name}@example.test`,
      passwordHash: hash,
      passwordAlgo: 'argon2id',
      state: 'active',
      primaryGroupId: SEED_GROUP.registered,
    })
  }
}

beforeEach(async () => {
  messages = new FakeMessages()
  daily.outcome = null
  actorRef.current = await actorFor(SEED_GROUP.registered, IVAN)
  await install()
}, 30_000)

describe('sending', () => {
  it('sends from the signed-in member and lands in the sent folder', async () => {
    const result = await run(
      sendMessageAction,
      form([
        ['to', 'bob'],
        ['subject', 'Hello'],
        ['message', 'A message.'],
      ]),
    )

    expect(result.redirectedTo).toBe('/messages?folder=sent&sent=1')
    expect(messages.messages[0]).toMatchObject({ authorUserId: IVAN, authorUsername: 'ivan' })
    expect(messages.copies.map((c) => c.ownerUserId)).toEqual([BOB])
  })

  it('takes the sender from the session, never from the form', async () => {
    await run(
      sendMessageAction,
      form([
        ['to', 'bob'],
        ['subject', 'Hello'],
        ['message', 'A message.'],
        ['authorUserId', '999'],
      ]),
    )

    expect(messages.messages[0]?.authorUserId).toBe(IVAN)
  })

  it('refuses a guest', async () => {
    actorRef.current = await actorFor(SEED_GROUP.guest, null)

    const result = await run(
      sendMessageAction,
      form([
        ['to', 'bob'],
        ['subject', 'Hello'],
        ['message', 'A message.'],
      ]),
    )

    expect(result.error).toContain('logged in')
    expect(messages.messages).toEqual([])
  })

  it('refuses a sender whose groups do not allow private messages', async () => {
    actorRef.current = await actorFor(SEED_GROUP.guest, BOB)

    const result = await run(
      sendMessageAction,
      form([
        ['to', 'bob'],
        ['subject', 'Hello'],
        ['message', 'A message.'],
      ]),
    )

    expect(result.error).toBe('You cannot use private messages.')
    expect(messages.messages).toEqual([])
  })

  it('refuses a board with no message store rather than pretending', async () => {
    installTestContainer({ container: { messages: null } })

    const result = await run(
      sendMessageAction,
      form([
        ['to', 'bob'],
        ['subject', 'Hello'],
        ['message', 'A message.'],
      ]),
    )

    expect(result.error).toContain('sample data')
  })

  it('gives back what was typed when a recipient name is wrong', async () => {
    const result = await run(
      sendMessageAction,
      form([
        ['to', 'nobody'],
        ['subject', 'Hello'],
        ['message', 'A long message.'],
      ]),
    )

    expect(result.error).toContain('nobody')
    expect(result.values).toMatchObject({ subject: 'Hello', message: 'A long message.' })
  })

  it('records a requested read receipt', async () => {
    await run(
      sendMessageAction,
      form([
        ['to', 'bob'],
        ['subject', 'Hello'],
        ['message', 'A message.'],
        ['receipt', 'on'],
      ]),
    )

    expect(messages.messages[0]?.receiptRequested).toBe(true)
  })
})

describe('the daily private message allowance', () => {
  const CAPPED = { allowed: false, used: 11, retryAfterSeconds: 7200 } as const

  const SEND: Array<[string, string]> = [
    ['to', 'bob'],
    ['subject', 'Hello'],
    ['message', 'A message.'],
  ]

  it('refuses once maxPrivateMessagesPerDay is spent, and sends nothing', async () => {
    daily.outcome = { ...CAPPED }

    const result = await run(sendMessageAction, form(SEND))

    expect(result.error).toBe(
      'You have used your allowance of private messages for today. It resets in 2 hours.',
    )
    expect(messages.messages).toEqual([])
    expect(messages.copies).toEqual([])
  })

  it('keeps what was typed, so a refusal does not lose the message', async () => {
    daily.outcome = { ...CAPPED }

    const result = await run(sendMessageAction, form(SEND))

    expect(result.values).toMatchObject({ to: 'bob', subject: 'Hello', message: 'A message.' })
  })

  it('sends as normal when the allowance is not spent', async () => {
    expect((await run(sendMessageAction, form(SEND))).redirectedTo).toBe(
      '/messages?folder=sent&sent=1',
    )
    expect(messages.messages).toHaveLength(1)
  })
})

describe('the folder action bar', () => {
  async function seedInbox(): Promise<number> {
    actorRef.current = await actorFor(SEED_GROUP.registered, BOB)
    messages.copies.push({
      id: 42,
      messageId: 1,
      ownerUserId: BOB,
      folder: 'inbox',
      role: 'to',
      readAt: null,
    })
    return 42
  }

  it('moves the selected copies and reports how many', async () => {
    const copyId = await seedInbox()

    const result = await run(
      messageBulkAction,
      form([
        ['folder', 'inbox'],
        ['command', 'trash'],
        ['copyId', String(copyId)],
      ]),
    )

    expect(result.redirectedTo).toBe('/messages?moved=1')
    expect(messages.copies[0]?.folder).toBe('trash')
  })

  it('restores trashed copies to sent for the author and inbox for a recipient', async () => {
    actorRef.current = await actorFor(SEED_GROUP.registered, BOB)
    messages.copies.push(
      { id: 30, messageId: 1, ownerUserId: BOB, folder: 'trash', role: 'author', readAt: null },
      { id: 31, messageId: 2, ownerUserId: BOB, folder: 'trash', role: 'to', readAt: null },
    )

    const result = await run(
      messageBulkAction,
      form([
        ['folder', 'trash'],
        ['command', 'restore'],
        ['copyId', '30'],
        ['copyId', '31'],
      ]),
    )

    expect(result.redirectedTo).toBe('/messages?folder=trash&moved=2')
    expect(messages.copies.find((c) => c.id === 30)?.folder).toBe('sent')
    expect(messages.copies.find((c) => c.id === 31)?.folder).toBe('inbox')
  })

  it('marks read and unread', async () => {
    const copyId = await seedInbox()

    await run(
      messageBulkAction,
      form([
        ['folder', 'inbox'],
        ['command', 'read'],
        ['copyId', String(copyId)],
      ]),
    )
    expect(messages.copies[0]?.readAt).not.toBeNull()

    await run(
      messageBulkAction,
      form([
        ['folder', 'inbox'],
        ['command', 'unread'],
        ['copyId', String(copyId)],
      ]),
    )
    expect(messages.copies[0]?.readAt).toBeNull()
  })

  it('empties the trash without any selection', async () => {
    actorRef.current = await actorFor(SEED_GROUP.registered, BOB)
    messages.copies.push({
      id: 7,
      messageId: 1,
      ownerUserId: BOB,
      folder: 'trash',
      role: 'to',
      readAt: null,
    })

    const result = await run(
      messageBulkAction,
      form([
        ['folder', 'trash'],
        ['command', 'empty'],
        ['confirmed', '1'],
      ]),
    )

    expect(result.redirectedTo).toBe('/messages?folder=trash&emptied=1')
    expect(messages.copies).toEqual([])
  })

  it('asks to confirm before emptying the trash, and deletes nothing until it is', async () => {
    actorRef.current = await actorFor(SEED_GROUP.registered, BOB)
    messages.copies.push({
      id: 7,
      messageId: 1,
      ownerUserId: BOB,
      folder: 'trash',
      role: 'to',
      readAt: null,
    })

    const state = await messageBulkAction(
      EMPTY_STATE,
      form([
        ['folder', 'trash'],
        ['command', 'empty'],
      ]),
    )

    expect(state.confirm).toBeDefined()
    expect(messages.copies).toHaveLength(1)
  })

  it('asks to confirm before deleting messages forever, and removes nothing until it is', async () => {
    const copyId = await seedInbox()

    const state = await messageBulkAction(
      EMPTY_STATE,
      form([
        ['folder', 'inbox'],
        ['command', 'delete'],
        ['copyId', String(copyId)],
      ]),
    )

    expect(state.confirm).toBeDefined()
    expect(messages.copies).toHaveLength(1)
  })

  it('asks for a selection rather than acting on everything', async () => {
    await seedInbox()

    const result = await run(
      messageBulkAction,
      form([
        ['folder', 'inbox'],
        ['command', 'delete'],
      ]),
    )

    expect(result.error).toContain('Select at least one')
    expect(messages.copies).toHaveLength(1)
  })

  it('ignores a copy id belonging to somebody else', async () => {
    messages.copies.push({
      id: 99,
      messageId: 1,
      ownerUserId: BOB,
      folder: 'inbox',
      role: 'to',
      readAt: null,
    })

    const result = await run(
      messageBulkAction,
      form([
        ['folder', 'inbox'],
        ['command', 'delete'],
        ['copyId', '99'],
        ['confirmed', '1'],
      ]),
    )

    expect(result.redirectedTo).toBe('/messages?deleted=0')
    expect(messages.copies).toHaveLength(1)
  })

  it('drops a non-numeric selection rather than failing on it', async () => {
    await seedInbox()

    const result = await run(
      messageBulkAction,
      form([
        ['folder', 'inbox'],
        ['command', 'trash'],
        ['copyId', 'not-a-number'],
      ]),
    )

    expect(result.error).toContain('Select at least one')
  })

  it('refuses a command it does not know', async () => {
    const copyId = await seedInbox()

    const result = await run(
      messageBulkAction,
      form([
        ['folder', 'inbox'],
        ['command', 'incinerate'],
        ['copyId', String(copyId)],
      ]),
    )

    expect(result.error).toBeDefined()
    expect(messages.copies[0]?.folder).toBe('inbox')
  })
})
