import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { postBodyHtml } from '@meith/bbcode'

import { getContainer } from '@/server/container'
import { getActor } from '@/server/context'
import { messageService } from '@/server/messages'
import { getViewerPreferences } from '@/server/viewer-preferences'
import { buildMessageView, folderHref } from '@/view/messages'

export const metadata: Metadata = { title: 'Private message' }

/**
 * F60 — one private message.
 *
 * **Opening it is what marks it read**, unlike F55's notification centre where
 * opening the list deliberately does not. A message is opened one at a time and
 * by choice, so there is nothing to lose track of — and the read time is what
 * the sender's tracking list shows.
 *
 * The body goes through F36's `postBodyHtml`, exactly as a post body does: the
 * same renderer, the same version, the same lazy invalidation. A renderer
 * security fix therefore reaches private messages on the next page load like it
 * reaches everything else, without a migration and without a second code path
 * anybody has to remember to fix.
 */
export default async function MessagePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const messageId = Number(id)
  if (!Number.isInteger(messageId) || messageId <= 0) notFound()

  const actor = await getActor()
  const { authorizer } = getContainer()
  const service = messageService()

  if (actor.userId === null || service === null) notFound()
  if (!authorizer.can(actor, 'pm.use')) notFound()

  /*
   * `open` throws NotFoundError for a message this member holds no copy of —
   * the same answer as for one that does not exist, so the id space cannot be
   * used to discover whether somebody was written to.
   */
  const detail = await service.open({ messageId, userId: actor.userId }).catch(() => null)
  if (detail === null) notFound()

  const preferences = await getViewerPreferences()
  const view = buildMessageView({
    detail,
    bodyHtml: postBodyHtml(detail.message),
    viewerUserId: actor.userId,
    now: new Date(),
    timeZone: preferences.timezone,
  })

  return (
    <main id="board-content" tabIndex={-1} className="flex-1">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-6 py-8">
        <a href={folderHref(view.folder)} className="text-sm text-primary hover:underline">
          ← Back to {view.folder}
        </a>

        <div className="flex flex-col gap-1">
          <h1 className="font-serif text-2xl font-semibold">{view.subject}</h1>
          <p className="text-sm text-muted-foreground">
            From <span className="font-medium text-foreground">{view.author}</span>{' '}
            <time dateTime={view.at.iso}>{view.at.label}</time>
          </p>
          {view.participants.length > 0 && (
            <p className="text-xs text-muted-foreground">
              To:{' '}
              {view.participants
                .filter((participant) => participant.role !== 'author')
                .map((participant) =>
                  participant.role === 'bcc'
                    ? `${participant.username} (bcc)`
                    : participant.username,
                )
                .join(', ')}
            </p>
          )}
        </div>

        {/*
          Trusted HTML from `@meith/bbcode` — the one place on this board where
          `dangerouslySetInnerHTML` is correct, for the same reason a post body
          uses it: the string is this codebase's own construction, escaped at
          the point it was built.
        */}
        <article
          className="prose prose-sm max-w-none break-words"
          dangerouslySetInnerHTML={{ __html: view.bodyHtml }}
        />

        <div className="flex flex-wrap items-center gap-4 border-t border-border pt-4">
          {view.actions.map((action) => (
            <a key={action.href} href={action.href} className="text-sm text-primary hover:underline">
              {action.label}
            </a>
          ))}
          {view.reportHref !== null && (
            <a href={view.reportHref} className="text-sm text-muted-foreground hover:text-foreground">
              Report this message
            </a>
          )}
        </div>

        {view.tracking.length > 0 && (
          <section className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-medium">Who has read it</h2>
            <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
              {view.tracking.map((participant) => (
                <li key={participant.username}>
                  <span className="text-foreground">{participant.username}</span>
                  {participant.role === 'bcc' ? ' (bcc)' : ''} — {participant.readLabel}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  )
}
