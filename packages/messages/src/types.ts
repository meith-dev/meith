export const MESSAGE_FOLDERS = ['inbox', 'sent', 'trash'] as const
export type MessageFolder = (typeof MESSAGE_FOLDERS)[number]

export const MESSAGE_ROLES = ['author', 'to', 'bcc'] as const
export type MessageRole = (typeof MESSAGE_ROLES)[number]

export function parseFolder(value: string): MessageFolder | null {
  return MESSAGE_FOLDERS.includes(value as MessageFolder) ? (value as MessageFolder) : null
}

export const SUBJECT_MAX = 200
export const BODY_MAX = 20_000
export const MAX_RECIPIENTS = 10

export interface PrivateMessage {
  readonly id: number
  readonly authorUserId: number | null
  readonly authorUsername: string
  readonly subject: string
  readonly message: string
  readonly messageHtml: string | null
  readonly renderVersion: number
  readonly bodyFormat: number
  readonly vocabVersion: number
  readonly replyToId: number | null
  readonly receiptRequested: boolean
  readonly sentAt: Date
}

export interface MessageCopy {
  readonly id: number
  readonly messageId: number
  readonly ownerUserId: number
  readonly folder: MessageFolder
  readonly role: MessageRole
  readonly readAt: Date | null
}

export interface MessageListRow {
  readonly copyId: number
  readonly messageId: number
  readonly folder: MessageFolder
  readonly role: MessageRole
  readonly subject: string
  readonly sentAt: Date
  readonly readAt: Date | null
  readonly counterparties: readonly string[]
  readonly moreCounterparties: number
}

export interface MessageParticipant {
  readonly userId: number
  readonly username: string
  readonly role: MessageRole
  readonly readAt: Date | null
}

export interface MessageDetail {
  readonly message: PrivateMessage
  readonly copy: MessageCopy
  readonly participants: readonly MessageParticipant[]
}

export interface FolderCounts {
  readonly inbox: number
  readonly sent: number
  readonly trash: number
  readonly unread: number
  readonly stored: number
}

export interface ResolvedRecipient {
  readonly name: string
  readonly userId: number | null
  readonly bcc: boolean
}

export interface MessagePolicy {
  lookup(username: string): Promise<{ id: number; username: string } | null>
  limitsFor(userId: number): Promise<{ quota: number; canReceive: boolean }>

  blocks?(ownerUserId: number, senderUserId: number): Promise<boolean>
}

export interface MessageRepository {
  list(input: {
    readonly userId: number
    readonly folder: MessageFolder
    readonly limit: number
    readonly before?: number | undefined
    readonly offset?: number | undefined
  }): Promise<readonly MessageListRow[]>

  counts(userId: number): Promise<FolderCounts>

  storedCounts(userIds: readonly number[]): Promise<ReadonlyMap<number, number>>

  detail(input: {
    readonly messageId: number
    readonly userId: number
  }): Promise<MessageDetail | null>

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

  setRead(input: {
    readonly userId: number
    readonly copyIds: readonly number[]
    readonly at: Date | null
  }): Promise<number>

  move(input: {
    readonly userId: number
    readonly copyIds: readonly number[]
    readonly folder: MessageFolder
  }): Promise<number>

  remove(input: { readonly userId: number; readonly copyIds: readonly number[] }): Promise<number>

  emptyFolder(input: { readonly userId: number; readonly folder: MessageFolder }): Promise<number>

  forReport(messageId: number): Promise<PrivateMessage | null>
}

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
