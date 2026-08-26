export interface ThreadCreated {
  readonly kind: 'thread.created'
  readonly threadId: number
  readonly forumId: number
  readonly authorId: number | null
  readonly subject: string
}

export interface PostCreated {
  readonly kind: 'post.created'
  readonly postId: number
  readonly threadId: number
  readonly forumId: number
  readonly authorId: number | null
}

export type WebhookEvent = ThreadCreated | PostCreated

export function eventPath(event: WebhookEvent): string {
  return event.kind === 'thread.created'
    ? `/threads/${event.threadId}`
    : `/threads/${event.threadId}#post-${event.postId}`
}

export function eventLink(boardUrl: string, event: WebhookEvent): string {
  return `${boardUrl.replace(/\/+$/, '')}${eventPath(event)}`
}

export function discordBody(event: WebhookEvent, boardUrl: string): Record<string, unknown> {
  const link = eventLink(boardUrl, event)

  if (event.kind === 'thread.created' && event.subject.trim() !== '') {
    return { content: link, embeds: [{ title: event.subject.trim(), url: link }] }
  }
  return { content: link }
}

export function jsonBody(event: WebhookEvent, boardUrl: string): Record<string, unknown> {
  const link = eventLink(boardUrl, event)

  return event.kind === 'thread.created'
    ? {
        event: event.kind,
        url: link,
        threadId: event.threadId,
        forumId: event.forumId,
        authorId: event.authorId,
        subject: event.subject,
      }
    : {
        event: event.kind,
        url: link,
        postId: event.postId,
        threadId: event.threadId,
        forumId: event.forumId,
        authorId: event.authorId,
      }
}

export function bodyFor(
  event: WebhookEvent,
  format: 'discord' | 'json',
  boardUrl: string,
): Record<string, unknown> {
  return format === 'discord' ? discordBody(event, boardUrl) : jsonBody(event, boardUrl)
}
