import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { PanelPage } from '@/components/shell/panel-page'
import { ComposeForm } from '@/components/messages/message-forms'
import { getContainer } from '@/server/container'
import { getActor } from '@/server/context'
import { messageService } from '@/server/messages'

export const metadata: Metadata = { title: 'Write a message' }

export default async function ComposePage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string; reply?: string; forward?: string }>
}) {
  const query = await searchParams
  const actor = await getActor()
  const { authorizer } = getContainer()
  const service = messageService()

  if (actor.userId === null || service === null) notFound()
  if (!authorizer.can(actor, 'pm.use')) notFound()

  const reply = positiveInt(query.reply)
  const forward = positiveInt(query.forward)

  const draft =
    reply !== null
      ? await service
          .replyDraft({ messageId: reply, userId: actor.userId })
          .catch(() => null)
      : forward !== null
        ? await service
            .forwardDraft({ messageId: forward, userId: actor.userId })
            .catch(() => null)
        : null

  return (
    <PanelPage
      back={{ href: '/messages', label: 'Private messages' }}
      title="Write a message"
      lede="Private messages are not moderated, but the person you write to can report one."
    >
      <ComposeForm
        to={draft?.to ?? query.to ?? ''}
        subject={draft?.subject ?? ''}
        message={draft?.message ?? ''}
        replyToId={draft?.replyToId ?? null}
      />
    </PanelPage>
  )
}

function positiveInt(raw: string | undefined): number | null {
  if (raw === undefined) return null
  const value = Number(raw)
  return Number.isInteger(value) && value > 0 ? value : null
}
