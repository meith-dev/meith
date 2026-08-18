import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { ComposeForm } from '@/components/messages/message-forms'
import { PanelPage } from '@/components/shell/panel-page'
import { getContainer } from '@/server/container'
import { getActor } from '@/server/context'
import { getTranslator, tr } from '@/server/i18n'
import { messageService } from '@/server/messages'
import { messageFormsCopy } from '@/view/content-copy'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.write-message') }
}

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
      ? await service.replyDraft({ messageId: reply, userId: actor.userId }).catch(() => null)
      : forward !== null
        ? await service.forwardDraft({ messageId: forward, userId: actor.userId }).catch(() => null)
        : null

  return (
    <PanelPage
      back={{ href: '/messages', label: 'Private messages' }}
      title={await tr('page.write-message')}
      lede={await tr('page.private-messages-not-moderated-but')}
    >
      <ComposeForm
        copy={messageFormsCopy(await getTranslator())}
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
