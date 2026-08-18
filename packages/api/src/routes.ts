import {
  boolean,
  choice,
  envelope,
  integer,
  list,
  MESSAGE_FOLDERS,
  object,
  page,
  ref,
  type Schema,
  SUBSCRIPTION_MODES,
  SUBSCRIPTION_TARGETS,
  text,
} from './schema'
import type { Scope } from './tokens'

export type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE'

export interface ParamSpec {
  readonly name: string
  readonly in: 'path' | 'query'
  readonly schema: Schema
  readonly required?: boolean
}

export interface ResponseSpec {
  readonly status: number
  readonly schema: Schema
}

export interface RouteSpec {
  readonly method: Method
  readonly path: string
  readonly scope: Scope
  readonly summary: string
  readonly cost: number
  readonly authenticated: boolean
  readonly params?: readonly ParamSpec[]
  readonly request?: Schema
  readonly response: ResponseSpec
}

const LIMIT: ParamSpec = {
  name: 'limit',
  in: 'query',
  schema: integer('How many rows to return. Defaults to 25, capped at 100.'),
}

const AFTER_CURSOR: ParamSpec = {
  name: 'after',
  in: 'query',
  schema: text('The `nextCursor` from the previous page.'),
}

function pathId(name: string, of: string): ParamSpec {
  return { name, in: 'path', schema: integer(of), required: true }
}

export const ROUTES = [
  {
    method: 'GET',
    path: '/me',
    scope: 'members:read',
    summary: 'The token’s owner, and the scopes this token carries.',
    cost: 1,
    authenticated: true,
    response: { status: 200, schema: envelope(ref('Identity')) },
  },
  {
    method: 'GET',
    path: '/forums',
    scope: 'forums:read',
    summary: 'Every forum the caller may see, as a flat list with parent ids.',
    cost: 1,
    authenticated: false,
    response: { status: 200, schema: object({ data: list(ref('Forum')) }) },
  },
  {
    method: 'GET',
    path: '/forums/:forumId/threads',
    scope: 'threads:read',
    summary: 'Threads in a forum, newest activity first, keyset-paged.',
    cost: 1,
    authenticated: false,
    params: [pathId('forumId', 'The forum to list.'), LIMIT, AFTER_CURSOR],
    response: { status: 200, schema: page(ref('Thread'), 'nextCursor') },
  },
  {
    method: 'POST',
    path: '/forums/:forumId/threads',
    scope: 'threads:write',
    summary:
      'Start a thread. Subject to the same flood control, approval queue and word ' +
      'limits as the web form.',
    cost: 10,
    authenticated: true,
    params: [pathId('forumId', 'The forum to post in.')],
    request: object(
      {
        title: text('The thread’s title.'),
        message: text('The first post’s body, as Markdown.'),
        prefixId: integer('A thread prefix to apply, if the forum offers any.', {
          nullable: true,
        }),
        subscribe: boolean('Follow the thread after starting it.'),
      },
      ['title', 'message'],
    ),
    response: {
      status: 201,
      schema: envelope(
        object({
          id: integer('The new thread’s id.'),
          postId: integer('The first post’s id.'),
          slug: text('The URL-safe form of the title.'),
          visibility: choice('`unapproved` when the post went to the moderation queue.', [
            'visible',
            'unapproved',
          ]),
        }),
      ),
    },
  },
  {
    method: 'GET',
    path: '/threads/:threadId',
    scope: 'threads:read',
    summary: 'One thread’s metadata.',
    cost: 1,
    authenticated: false,
    params: [pathId('threadId', 'The thread to read.')],
    response: { status: 200, schema: envelope(ref('Thread')) },
  },
  {
    method: 'GET',
    path: '/threads/:threadId/posts',
    scope: 'posts:read',
    summary: 'Posts in a thread, oldest first, keyset-paged.',
    cost: 1,
    authenticated: false,
    params: [
      pathId('threadId', 'The thread to read.'),
      LIMIT,
      { name: 'after', in: 'query', schema: integer('The `nextAfterId` from the previous page.') },
    ],
    response: { status: 200, schema: page(ref('Post'), 'nextAfterId') },
  },
  {
    method: 'POST',
    path: '/threads/:threadId/posts',
    scope: 'posts:write',
    summary: 'Post a reply. Subject to the same flood control and moderation as the web form.',
    cost: 5,
    authenticated: true,
    params: [pathId('threadId', 'The thread to reply in.')],
    request: object(
      {
        message: text('The reply’s body, as Markdown.'),
        subscribe: boolean('Follow the thread after replying.'),
      },
      ['message'],
    ),
    response: {
      status: 201,
      schema: envelope(
        object({
          id: integer('The new post’s id.'),
          threadId: integer('The thread it landed in.'),
          visibility: choice('`unapproved` when the post went to the moderation queue.', [
            'visible',
            'unapproved',
          ]),
        }),
      ),
    },
  },
  {
    method: 'PATCH',
    path: '/threads/:threadId/posts/:postId',
    scope: 'posts:write',
    summary:
      'Edit a post. The owner’s permissions decide whether that is their own post, ' +
      'anybody’s, and whether the edit window has closed.',
    cost: 5,
    authenticated: true,
    params: [
      pathId('threadId', 'The thread the post is in.'),
      pathId('postId', 'The post to edit.'),
    ],
    request: object(
      {
        message: text('The replacement body, as Markdown.'),
        reason: text('An edit reason, shown under the post.'),
      },
      ['message'],
    ),
    response: {
      status: 200,
      schema: envelope(
        object({
          id: integer('The edited post’s id.'),
          threadId: integer('The thread it is in.'),
          changed: boolean('False when the submitted body matched what was already there.'),
          heldForApproval: boolean('Whether the edit sent the post back to the queue.'),
        }),
      ),
    },
  },
  {
    method: 'DELETE',
    path: '/threads/:threadId/posts/:postId',
    scope: 'posts:write',
    summary:
      'Remove a post. This is the board’s soft delete — the same one the web form ' +
      'performs, recoverable by a moderator.',
    cost: 5,
    authenticated: true,
    params: [
      pathId('threadId', 'The thread the post is in.'),
      pathId('postId', 'The post to remove.'),
    ],
    response: {
      status: 200,
      schema: envelope(
        object({
          id: integer('The removed post’s id.'),
          threadId: integer('The thread it was in.'),
          changed: boolean('False when the post was already removed.'),
        }),
      ),
    },
  },
  {
    method: 'GET',
    path: '/members/:userId',
    scope: 'members:read',
    summary: 'A member’s public profile.',
    cost: 1,
    authenticated: false,
    params: [pathId('userId', 'The member to read.')],
    response: { status: 200, schema: envelope(ref('Member')) },
  },
  {
    method: 'POST',
    path: '/members/:userId/reputation',
    scope: 'reputation:write',
    summary:
      'Rate a member, optionally against one of their posts. The board’s reputation ' +
      'settings decide whether negative points and empty comments are allowed.',
    cost: 5,
    authenticated: true,
    params: [pathId('userId', 'The member being rated.')],
    request: object(
      {
        points: integer('The rating, within what the board allows.'),
        comment: text('Why. Some boards require one.'),
        postId: integer('The post being rated, if the rating is about one.', { nullable: true }),
      },
      ['points'],
    ),
    response: {
      status: 201,
      schema: envelope(object({ userId: integer('The member who was rated.') })),
    },
  },
  {
    method: 'GET',
    path: '/messages',
    scope: 'messages:read',
    summary: 'One folder of the caller’s private messages. Listing marks nothing read.',
    cost: 1,
    authenticated: true,
    params: [
      {
        name: 'folder',
        in: 'query',
        schema: choice('Which folder to list. Defaults to `inbox`.', MESSAGE_FOLDERS),
      },
      { name: 'before', in: 'query', schema: integer('The `nextBefore` from the previous page.') },
    ],
    response: { status: 200, schema: page(ref('MessageSummary'), 'nextBefore') },
  },
  {
    method: 'POST',
    path: '/messages',
    scope: 'messages:write',
    summary:
      'Send a private message. Recipient quotas, ignore lists and the board’s ' +
      'message rate limits all apply.',
    cost: 10,
    authenticated: true,
    request: object(
      {
        to: text('Recipient usernames, separated by semicolons.'),
        bcc: text('Blind recipients, separated by semicolons.'),
        subject: text('The subject line.'),
        message: text('The body, as Markdown.'),
        receiptRequested: boolean('Ask to be told when it is read.'),
        replyToId: integer('The message this replies to.', { nullable: true }),
      },
      ['to', 'subject', 'message'],
    ),
    response: {
      status: 201,
      schema: envelope(object({ id: integer('The sent message’s id.') })),
    },
  },
  {
    method: 'GET',
    path: '/messages/:messageId',
    scope: 'messages:read',
    summary:
      'One private message the caller is on. Opening it marks it read and, if the ' +
      'sender asked for a receipt, tells them.',
    cost: 1,
    authenticated: true,
    params: [pathId('messageId', 'The message to open.')],
    response: { status: 200, schema: envelope(ref('Message')) },
  },
  {
    method: 'GET',
    path: '/threads/:threadId/poll',
    scope: 'threads:read',
    summary: 'A thread’s poll, with the running totals and the caller’s own vote.',
    cost: 1,
    authenticated: false,
    params: [pathId('threadId', 'The thread whose poll to read.')],
    response: { status: 200, schema: envelope(ref('Poll')) },
  },
  {
    method: 'POST',
    path: '/polls/:pollId/votes',
    scope: 'polls:write',
    summary: 'Vote in a thread’s poll.',
    cost: 5,
    authenticated: true,
    params: [pathId('pollId', 'The poll to vote in.')],
    request: object({
      threadId: integer('The thread the poll is attached to.'),
      optionId: integer('The option being voted for.'),
    }),
    response: {
      status: 201,
      schema: envelope(object({ pollId: integer('The poll voted in.') })),
    },
  },
  {
    method: 'GET',
    path: '/subscriptions',
    scope: 'subscriptions:read',
    summary: 'Everything the caller follows, filtered to forums they may still see.',
    cost: 1,
    authenticated: true,
    response: { status: 200, schema: object({ data: list(ref('Subscription')) }) },
  },
  {
    method: 'POST',
    path: '/subscriptions',
    scope: 'subscriptions:write',
    summary: 'Follow a thread or a forum.',
    cost: 2,
    authenticated: true,
    request: object(
      {
        target: choice('What to follow.', SUBSCRIPTION_TARGETS),
        targetId: integer('The thread or forum to follow.'),
        mode: choice('How to be told about new posts. Defaults to `instant`.', SUBSCRIPTION_MODES),
      },
      ['target', 'targetId'],
    ),
    response: {
      status: 201,
      schema: envelope(
        object({
          target: choice('What is followed.', SUBSCRIPTION_TARGETS),
          targetId: integer('What is followed.'),
          mode: choice('How the caller will be told.', SUBSCRIPTION_MODES),
        }),
      ),
    },
  },
  {
    method: 'DELETE',
    path: '/subscriptions/:target/:targetId',
    scope: 'subscriptions:write',
    summary: 'Stop following a thread or a forum.',
    cost: 2,
    authenticated: true,
    params: [
      {
        name: 'target',
        in: 'path',
        schema: choice('What to stop following.', SUBSCRIPTION_TARGETS),
        required: true,
      },
      pathId('targetId', 'The thread or forum to stop following.'),
    ],
    response: {
      status: 200,
      schema: envelope(
        object({
          target: choice('What is no longer followed.', SUBSCRIPTION_TARGETS),
          targetId: integer('What is no longer followed.'),
        }),
      ),
    },
  },
  {
    method: 'GET',
    path: '/search',
    scope: 'search:read',
    summary:
      'Full-text search, filtered to what the caller may read. ' +
      'Narrow it with `forum`, `by`, `when`, `in` and `show`, and order it with `sort`.',
    cost: 10,
    authenticated: false,
    params: [
      { name: 'q', in: 'query', schema: text('The search term.'), required: true },
      { name: 'forum', in: 'query', schema: integer('Restrict to a forum. Repeatable.') },
      { name: 'by', in: 'query', schema: integer('Restrict to an author’s user id. Repeatable.') },
      { name: 'when', in: 'query', schema: text('Restrict to a period, such as `week`.') },
      { name: 'in', in: 'query', schema: text('Match `titles`, `posts` or both.') },
      { name: 'show', in: 'query', schema: text('Group results as posts or as threads.') },
      { name: 'sort', in: 'query', schema: text('Order the results.') },
      LIMIT,
      AFTER_CURSOR,
    ],
    response: { status: 200, schema: page(ref('SearchHit'), 'nextCursor') },
  },
] as const satisfies readonly RouteSpec[]

export type RouteKey = `${Method} ${string}`

export function routeKey(route: Pick<RouteSpec, 'method' | 'path'>): RouteKey {
  return `${route.method} ${route.path}`
}

export function matchRoute(
  method: string,
  path: string,
): { readonly route: RouteSpec; readonly params: Readonly<Record<string, string>> } | null {
  const parts = path.split('/').filter((part) => part !== '')

  for (const route of ROUTES) {
    if (route.method !== method) continue

    const template = route.path.split('/').filter((part) => part !== '')
    if (template.length !== parts.length) continue

    const params: Record<string, string> = {}
    let matched = true

    for (const [index, segment] of template.entries()) {
      const actual = parts[index]!
      if (segment.startsWith(':')) {
        if (actual === '') {
          matched = false
          break
        }
        params[segment.slice(1)] = actual
        continue
      }
      if (segment !== actual) {
        matched = false
        break
      }
    }

    if (matched) return { route, params }
  }

  return null
}

export function idParam(value: string | undefined): number | null {
  if (value === undefined || !/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}
