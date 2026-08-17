import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { parseTargetKind } from '@meith/moderation'

import { ReportForm } from '@/components/moderation/report-forms'
import { PanelPage } from '@/components/shell/panel-page'
import { getContainer } from '@/server/container'
import { getActor } from '@/server/context'
import { tr } from '@/server/i18n'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.report') }
}

function positiveInt(value: string | undefined): number | null {
  if (value === undefined || !/^[1-9]\d*$/.test(value)) return null
  const id = Number(value)
  return Number.isSafeInteger(id) ? id : null
}

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; id?: string }>
}) {
  const query = await searchParams
  const kind = parseTargetKind(query.kind)
  const targetId = positiveInt(query.id)
  if (kind === null || targetId === null) notFound()

  const actor = await getActor()
  const { authorizer, reports } = getContainer()
  if (reports === null || actor.userId === null) notFound()
  if (!authorizer.can(actor, 'content.report')) notFound()

  const target = await reports.resolveTarget(kind, targetId, actor.userId)
  if (target === null) notFound()
  if (target.forumId !== null) {
    const matrix = await authorizer.forumMatrix(actor, target.forumId)
    const scope = {
      ...(await authorizer.moderatorTargetIn(actor, target.forumId, matrix)),
      threadAuthorId: target.threadAuthorUserId,
    }
    if (!authorizer.can(actor, 'thread.view', scope)) {
      notFound()
    }
  }

  const what =
    kind === 'user'
      ? `the member ${target.label}`
      : kind === 'private_message'
        ? `the private message “${target.label}”`
        : `“${target.label}”`

  return (
    <PanelPage
      frame="standalone"
      title={`Report ${what}`}
      lede={await tr('page.moderator-will-look-at-this')}
    >
      <ReportForm kind={kind} targetId={targetId} />
    </PanelPage>
  )
}
