import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

import { users } from './identity'

export const MESSAGE_FOLDERS = ['inbox', 'sent', 'trash'] as const
export type MessageFolder = (typeof MESSAGE_FOLDERS)[number]

export const MESSAGE_ROLES = ['author', 'to', 'bcc'] as const
export type MessageRole = (typeof MESSAGE_ROLES)[number]

export const privateMessages = pgTable(
  'private_messages',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
    authorUserId: integer('author_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    authorUsername: text('author_username').notNull().default(''),
    subject: text('subject').notNull(),
    message: text('message').notNull(),
    bodyFormat: smallint('body_format').notNull().default(1),
    messageHtml: text('message_html'),
    renderVersion: smallint('render_version').notNull().default(0),
    vocabVersion: smallint('vocab_version').notNull().default(0),
    replyToId: integer('reply_to_id').references((): AnyPgColumn => privateMessages.id, {
      onDelete: 'set null',
    }),
    receiptRequested: boolean('receipt_requested').notNull().default(false),
    legacyId: integer('legacy_id'),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('private_messages_render_version_idx').on(t.renderVersion, t.id),
    index('private_messages_vocab_version_idx').on(t.vocabVersion, t.id),
    uniqueIndex('private_messages_legacy_id_key')
      .on(t.legacyId)
      .where(sql`${t.legacyId} is not null`),
  ],
)

export const privateMessageCopies = pgTable(
  'private_message_copies',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
    messageId: integer('message_id')
      .notNull()
      .references(() => privateMessages.id, { onDelete: 'cascade' }),
    ownerUserId: integer('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    folder: text('folder').notNull().default('inbox'),
    role: text('role').notNull().default('to'),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('private_message_copies_unique').on(t.messageId, t.ownerUserId),
    index('private_message_copies_folder_idx').on(t.ownerUserId, t.folder, t.id.desc()),
    index('private_message_copies_unread_idx')
      .on(t.ownerUserId)
      .where(sql`${t.readAt} is null and ${t.folder} = 'inbox'`),
    index('private_message_copies_message_idx').on(t.messageId),
  ],
)
