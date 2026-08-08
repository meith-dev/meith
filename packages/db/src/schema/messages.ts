/**
 * R3.3 Messages: `private_messages`, `private_message_copies` (F60).
 *
 * The content is stored once and each participant owns a small copy row. See
 * `migrations/0011_private_messages.sql` for why — the short version is that
 * MyBB's row-per-copy duplicates the body per recipient, and quota then counts
 * something a member cannot see.
 *
 * Its own file rather than an addition to `content.ts` because a private
 * message is not board content: it has no community, no `visibility` column, and is
 * outside F47's `ContentScope` by construction. Filing it beside `posts` would
 * invite exactly the query that treats it like one.
 */

import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'

import { users } from './identity'

/** The three system folders a copy can be in. */
export const MESSAGE_FOLDERS = ['inbox', 'sent', 'trash'] as const
export type MessageFolder = (typeof MESSAGE_FOLDERS)[number]

/** What a copy records. Not the same question as which folder it is in. */
export const MESSAGE_ROLES = ['author', 'to', 'bcc'] as const
export type MessageRole = (typeof MESSAGE_ROLES)[number]

export const privateMessages = pgTable(
  'private_messages',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
    /** Null once the author's account is deleted; `authorUsername` survives. */
    authorUserId: integer('author_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    authorUsername: text('author_username').notNull().default(''),
    subject: text('subject').notNull(),
    /** Raw Markdown, the source of truth — same contract as `posts.message`. */
    message: text('message').notNull(),
    /** `BodyFormat`; see `posts.bodyFormat`. */
    bodyFormat: smallint('body_format').notNull().default(1),
    messageHtml: text('message_html'),
    renderVersion: smallint('render_version').notNull().default(0),
    /**
     * The board vocabulary that produced `message_html` (F71). See
     * `posts.vocabVersion`.
     *
     * Private messages get the board's smilies and directives, and the *word
     * filter* deliberately does not reach them. That is not an inconsistency:
     * the vocabulary is the markup language this board speaks, and a smiley
     * that works in a post and not in a message would be arbitrary. Filtering
     * private correspondence is a different decision, and the answer to it is
     * no.
     */
    vocabVersion: smallint('vocab_version').notNull().default(0),
    /*
     * Self-reference, so the column cannot point at a message that never
     * existed. `AnyPgColumn` is drizzle's required annotation for one: the
     * table's own type is not yet inferred at the point the callback is
     * declared, and without it TypeScript reports a circular inference.
     */
    replyToId: integer('reply_to_id').references((): AnyPgColumn => privateMessages.id, {
      onDelete: 'set null',
    }),
    receiptRequested: boolean('receipt_requested').notNull().default(false),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('private_messages_render_version_idx').on(t.renderVersion, t.id),
    index('private_messages_vocab_version_idx').on(t.vocabVersion, t.id),
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
    /** Null means unread. A timestamp because the sender's tracking wants *when*. */
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('private_message_copies_unique').on(t.messageId, t.ownerUserId),
    index('private_message_copies_folder_idx').on(t.ownerUserId, t.folder, t.id.desc()),
    /* Partial: unread is the small set, and the badge must not scan a board's
       whole history of read mail to answer "how many are new". */
    index('private_message_copies_unread_idx')
      .on(t.ownerUserId)
      .where(sql`${t.readAt} is null and ${t.folder} = 'inbox'`),
    index('private_message_copies_message_idx').on(t.messageId),
  ],
)
