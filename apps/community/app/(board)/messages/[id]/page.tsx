import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { postBodyHtml } from '@meith/markdown'

import { PanelPage } from '@/components/shell/panel-page'
import { getContainer } from '@/server/container'
import { activeVocabulary } from '@/server/content-admin'
import { getActor } from '@/server/context'
import { getTranslator, tr } from '@/server/i18n'
import { messageService } from '@/server/messages'
import { getViewerPreferences } from '@/server/viewer-preferences'
import { buildMessageView, folderHref } from '@/view/messages'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.private-message') }
}

export default async function MessagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const messageId = Number(id)
  if (!Number.isInteger(messageId) || messageId <= 0) notFound()

  const actor = await getActor()
  const { authorizer } = getContainer()
  const service = messageService()

  if (actor.userId === null || service === null) notFound()
  if (!authorizer.can(actor, 'pm.use')) notFound()

  const detail = await service.open({ messageId, userId: actor.userId }).catch(() => null)
  if (detail === null) notFound()

  const _preferences = await getViewerPreferences()
  const view = buildMessageView({
    detail,
    bodyHtml: postBodyHtml(detail.message, await activeVocabulary()),
    viewerUserId: actor.userId,
    now: new Date(),
    t: await getTranslator(),
  })

  return (
    <PanelPage
      back={{ href: folderHref(view.folder), label: `Back to ${view.folder}` }}
      title={view.subject}
      lede={
        <>
          From <span className="font-medium text-foreground">{view.author}</span>{' '}
          <time dateTime={view.at.iso}>{view.at.label}</time>
        </>
      }
      {...(view.participants.length > 0
        ? {
            meta: `To: ${view.participants
              .filter((participant) => participant.role !== 'author')
              .map((participant) =>
                participant.role === 'bcc' ? `${participant.username} (bcc)` : participant.username,
              )
              .join(', ')}`,
          }
        : {})}
    >
      <article
        className="prose prose-sm max-w-none break-words"
        dangerouslySetInnerHTML={{ __html: view.bodyHtml }}
      />

      <div className="flex flex-wrap items-center gap-4 border-t border-border pt-4">
        {view.actions.map((action) => (
          <a
            key={action.href}
            href={action.href}
            className="text-sm font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
          >
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
    </PanelPage>
  )
}
