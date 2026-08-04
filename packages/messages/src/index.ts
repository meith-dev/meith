/**
 * `@meith/messages` — F60.
 *
 * Private messages: multiple recipients, three system folders, read tracking
 * and receipts, a storage quota, reply and forward, mass actions, and a report
 * path that is the only way staff ever read one.
 *
 * The shape rests on one decision made in migration `0011`: **the message is
 * stored once and each participant owns a copy of it**, rather than MyBB's
 * row-per-copy. Quota then counts copies — the thing a member can actually
 * delete — and a re-render is one write rather than one per recipient.
 *
 * A domain package in the R2 sense: interfaces in, no SQL, no Next, no driver
 * implementations. It knows nothing about groups either: "may they use PMs" and
 * "how many may they keep" arrive through `MessagePolicy` as a boolean and a
 * number, resolved by `@meith/authorization` (F20).
 */
export {
  MESSAGE_FOLDERS,
  MESSAGE_ROLES,
  MAX_RECIPIENTS,
  SUBJECT_MAX,
  BODY_MAX,
  parseFolder,
  type FolderCounts,
  type MessageCopy,
  type MessageDetail,
  type MessageFolder,
  type MessageListRow,
  type MessageNotifierPort,
  type MessageParticipant,
  type MessagePolicy,
  type MessageRepository,
  type MessageRole,
  type PrivateMessage,
  type ResolvedRecipient,
} from './types'

export {
  MessageService,
  MESSAGES_PAGE_SIZE,
  splitNames,
  type Draft,
  type SendInput,
} from './service'
