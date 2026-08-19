export type ScalarType = 'string' | 'integer' | 'number' | 'boolean'

export interface ScalarSchema {
  readonly type: ScalarType
  readonly description: string
  readonly format?: string
  readonly enum?: readonly string[]
  readonly nullable?: boolean
}

export interface ObjectSchema {
  readonly type: 'object'
  readonly description?: string
  readonly properties: Readonly<Record<string, Schema>>
  readonly required: readonly string[]
}

export interface ArraySchema {
  readonly type: 'array'
  readonly description?: string
  readonly items: Schema
}

export interface RefSchema {
  readonly ref: ComponentName
  readonly description?: string
  readonly nullable?: boolean
}

export type Schema = ScalarSchema | ObjectSchema | ArraySchema | RefSchema

export function text(
  description: string,
  extra: Partial<Omit<ScalarSchema, 'type'>> = {},
): ScalarSchema {
  return { type: 'string', description, ...extra }
}

export function integer(
  description: string,
  extra: Partial<Omit<ScalarSchema, 'type'>> = {},
): ScalarSchema {
  return { type: 'integer', description, ...extra }
}

export function boolean(description: string): ScalarSchema {
  return { type: 'boolean', description }
}

export function timestamp(description: string, nullable = false): ScalarSchema {
  return { type: 'string', description, format: 'date-time', ...(nullable ? { nullable } : {}) }
}

export function choice(
  description: string,
  values: readonly string[],
  nullable = false,
): ScalarSchema {
  return { type: 'string', description, enum: values, ...(nullable ? { nullable } : {}) }
}

export function list(items: Schema, description?: string): ArraySchema {
  return { type: 'array', items, ...(description === undefined ? {} : { description }) }
}

export function object(
  properties: Readonly<Record<string, Schema>>,
  required: readonly string[] = Object.keys(properties),
  description?: string,
): ObjectSchema {
  return {
    type: 'object',
    properties,
    required,
    ...(description === undefined ? {} : { description }),
  }
}

export function ref(name: ComponentName, description?: string): RefSchema {
  return { ref: name, ...(description === undefined ? {} : { description }) }
}

export function nullableRef(name: ComponentName, description?: string): RefSchema {
  return { ref: name, nullable: true, ...(description === undefined ? {} : { description }) }
}

export function envelope(item: Schema): ObjectSchema {
  return object({ data: item })
}

export function page(
  item: Schema,
  cursor: 'nextCursor' | 'nextAfterId' | 'nextBefore',
): ObjectSchema {
  const cursorSchema =
    cursor === 'nextCursor'
      ? text('Pass back as `after` for the next page, or `null` at the end.', { nullable: true })
      : integer('Pass back as `after` for the next page, or `null` at the end.', {
          nullable: true,
        })

  return object({ data: list(item), [cursor]: cursorSchema })
}

export const COMPONENT_NAMES = [
  'Error',
  'Forum',
  'Identity',
  'Member',
  'Message',
  'MessageSummary',
  'Participant',
  'Poll',
  'PollOption',
  'Post',
  'SearchHit',
  'Subscription',
  'Thread',
] as const

export type ComponentName = (typeof COMPONENT_NAMES)[number]

export const VISIBILITY = ['visible', 'unapproved', 'deleted'] as const
export const SUBSCRIPTION_TARGETS = ['thread', 'forum'] as const
export const SUBSCRIPTION_MODES = ['instant', 'daily', 'weekly', 'none'] as const
export const MESSAGE_FOLDERS = ['inbox', 'sent', 'trash'] as const
export const MESSAGE_ROLES = ['author', 'to', 'bcc'] as const

export const COMPONENTS: Readonly<Record<ComponentName, ObjectSchema>> = {
  Error: object(
    {
      error: object({
        code: text('Stable and machine-readable. Branch on this, never on `message`.'),
        message: text('For a human reading a terminal. Translated to the board’s language.'),
        requestId: text('The board’s correlation id, for quoting in a report.', {
          nullable: true,
        }),
      }),
    },
    ['error'],
    'Every failure on every endpoint has this shape.',
  ),

  Forum: object(
    {
      id: integer('The forum’s id.'),
      title: text('The forum’s name.'),
      slug: text('The URL-safe form of the title.'),
      type: choice('What the forum holds.', ['category', 'forum', 'link']),
      parentId: integer('The forum this one sits under, or `null` at the top.', {
        nullable: true,
      }),
      depth: integer('How far down the tree the forum sits; the top level is 0.'),
    },
    undefined,
    'One forum, as the token’s owner may see it.',
  ),

  Identity: object(
    {
      userId: integer('The account the token belongs to.'),
      username: text('That account’s name.'),
      scopes: list(text('One scope.'), 'Every scope this token carries.'),
    },
    undefined,
    'Who the caller is, and what this token may ask for.',
  ),

  Member: object(
    {
      id: integer('The member’s user id.'),
      username: text('The member’s name.'),
      title: text('Their custom or group title.', { nullable: true }),
      postCount: integer('How many posts they have made.'),
      joinedAt: timestamp('When they registered.'),
      lastActiveAt: timestamp('When they were last seen, if the board records it.', true),
      location: text('Their stated location.', { nullable: true }),
      website: text('Their stated website.', { nullable: true }),
      bio: text('Their stated biography.', { nullable: true }),
    },
    undefined,
    'A member’s public profile — the same fields the member page shows a visitor.',
  ),

  Message: object(
    {
      id: integer('The message’s id.'),
      copyId: integer('The caller’s copy of the message, which folders and reads act on.'),
      authorUserId: integer('Who sent it, or `null` if the account is gone.', { nullable: true }),
      authorUsername: text('The sender’s name as it was at the time.'),
      subject: text('The subject line.'),
      message: text('The body, as Markdown source.'),
      folder: choice('Which of the caller’s folders this copy sits in.', MESSAGE_FOLDERS),
      role: choice('How the caller is on the message.', MESSAGE_ROLES),
      receiptRequested: boolean('Whether the sender asked to be told it was read.'),
      replyToId: integer('The message this one replies to, if any.', { nullable: true }),
      sentAt: timestamp('When it was sent.'),
      readAt: timestamp('When the caller read it, or `null`.', true),
      participants: list(ref('Participant'), 'Everyone on the message the caller may see.'),
    },
    undefined,
    'One private message, as one participant sees it. Reading marks it read.',
  ),

  MessageSummary: object(
    {
      copyId: integer('The caller’s copy of the message. Page on this.'),
      messageId: integer('The message itself.'),
      folder: choice('Which folder this copy sits in.', MESSAGE_FOLDERS),
      role: choice('How the caller is on the message.', MESSAGE_ROLES),
      subject: text('The subject line.'),
      sentAt: timestamp('When it was sent.'),
      readAt: timestamp('When the caller read it, or `null`.', true),
      counterparties: list(text('One name.'), 'The other people on the message.'),
      moreCounterparties: integer('How many further names were not listed.'),
    },
    undefined,
    'One row of a message folder. Listing does not mark anything read.',
  ),

  Participant: object(
    {
      userId: integer('The participant’s user id.'),
      username: text('Their name.'),
      role: choice('How they are on the message.', MESSAGE_ROLES),
      readAt: timestamp('When they read it, or `null`.', true),
    },
    undefined,
    'One person on a message. Blind copies are visible only to themselves and the sender.',
  ),

  Poll: object(
    {
      id: integer('The poll’s id.'),
      threadId: integer('The thread the poll is attached to.'),
      question: text('What the poll asks.'),
      closesAt: timestamp('When voting closes, or `null` if it does not.', true),
      options: list(ref('PollOption'), 'What may be voted for.'),
      votedOptionId: integer('What the caller voted for, or `null`.', { nullable: true }),
    },
    undefined,
    'A thread’s poll.',
  ),

  PollOption: object(
    {
      id: integer('The option’s id. Vote with this.'),
      label: text('The option as it is shown.'),
      votes: integer('How many votes it has.'),
    },
    undefined,
    'One option on a poll.',
  ),

  Post: object(
    {
      id: integer('The post’s id.'),
      threadId: integer('The thread it is in.'),
      number: integer('Its position in the thread, counting from 1.'),
      authorUserId: integer('Who wrote it, or `null` if the account is gone.', { nullable: true }),
      authorUsername: text('The author’s name as it was at the time.'),
      message: text('The body, as Markdown source.'),
      visibility: choice('Whether the post is public, held, or removed.', VISIBILITY),
      postedAt: timestamp('When it was posted.'),
    },
    undefined,
    'One post, as the caller may see it.',
  ),

  SearchHit: object(
    {
      postId: integer('The matching post.'),
      threadId: integer('The thread it is in.'),
      forumId: integer('The forum that thread is in.'),
      threadTitle: text('The thread’s title.'),
      authorUserId: integer('Who wrote it, or `null`.', { nullable: true }),
      authorUsername: text('The author’s name.'),
      postedAt: timestamp('When it was posted.'),
      excerpt: text('The matching passage, word-filtered as the board filters it.'),
    },
    undefined,
    'One search result.',
  ),

  Subscription: object(
    {
      target: choice('What is being followed.', SUBSCRIPTION_TARGETS),
      targetId: integer('The id of the thread or forum being followed.'),
      title: text('Its title.'),
      href: text('Where it lives on the board.'),
      mode: choice('How the follower is told about new posts.', SUBSCRIPTION_MODES),
      createdAt: timestamp('When the subscription was made.'),
      pending: integer('Posts since the follower last caught up.'),
    },
    undefined,
    'One thing the caller follows.',
  ),

  Thread: object(
    {
      id: integer('The thread’s id.'),
      forumId: integer('The forum it is in.'),
      title: text('The thread’s title.'),
      slug: text('The URL-safe form of the title.'),
      authorUserId: integer('Who started it, or `null` if the account is gone.', {
        nullable: true,
      }),
      authorUsername: text('The starter’s name as it was at the time.'),
      replyCount: integer('How many replies it has.'),
      viewCount: integer('How many times it has been read.'),
      isSticky: boolean('Whether it is pinned to the top of its forum.'),
      isLocked: boolean('Whether it is closed to further replies.'),
      visibility: choice('Whether the thread is public, held, or removed.', VISIBILITY),
      lastPostAt: timestamp('When it was last posted in.'),
    },
    undefined,
    'One thread, as the caller may see it.',
  ),
}
