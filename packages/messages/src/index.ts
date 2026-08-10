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
