import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { PollEditForm } from '@/components/content/poll-edit-form'
import { PanelPage } from '@/components/shell/panel-page'
import { getContainer } from '@/server/container'
import { getActor } from '@/server/context'
import { tr } from '@/server/i18n'
import { resolvePollScope } from '@/server/poll-scope'
import { leadingId } from '@/view/slug-id'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.edit-poll') }
}

export default async function EditPollPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const threadId = leadingId(slug)
  if (threadId === null) notFound()

  const { polls } = getContainer()
  if (polls === null) notFound()

  const actor = await getActor()
  const scope = await resolvePollScope(actor, threadId)
  if (scope === null || !scope.mayEdit) notFound()

  const poll = await polls.find(threadId, actor.userId)
  if (poll === null) notFound()

  return (
    <PanelPage
      frame="standalone"
      title={await tr('page.edit-poll')}
      lede={await tr('pollEdit.lede')}
      back={{ href: `/thread/${threadId}`, label: await tr('pollEdit.back') }}
    >
      <PollEditForm poll={poll} threadId={threadId} />
    </PanelPage>
  )
}
