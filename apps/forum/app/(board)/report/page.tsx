import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { parseTargetKind } from '@meith/moderation'

import { ReportForm } from '@/components/moderation/report-forms'
import { getContainer } from '@/server/container'
import { getActor } from '@/server/context'

export const metadata: Metadata = { title: 'Report' }

function positiveInt(value: string | undefined): number | null {
  if (value === undefined || !/^[1-9]\d*$/.test(value)) return null
  const id = Number(value)
  return Number.isSafeInteger(id) ? id : null
}

/**
 * F49 — one route for all three reportable kinds.
 *
 * One page rather than three (`/thread/…/report`, `/member/…/report`, …)
 * because the *decision* is identical in every case and only the target lookup
 * differs — and that lookup has to happen server-side regardless, since a form
 * says which row and nothing about whether this member could see it.
 */
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

  /*
   * The same read the action re-runs. Rendering the form is not authorisation,
   * but showing it for something this member cannot see would confirm the
   * thing exists — so the check happens here too.
   */
  const target = await reports.resolveTarget(kind, targetId, actor.userId)
  if (target === null) notFound()
  if (target.forumId !== null) {
    const matrix = await authorizer.forumMatrix(actor, target.forumId)
    if (!authorizer.can(actor, 'thread.view', { forumId: target.forumId, forum: matrix })) {
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
    <main id="board-content" tabIndex={-1} className="flex-1">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-6 py-8">
        <h1 className="font-serif text-2xl font-semibold">Report {what}</h1>
        <p className="text-sm text-muted-foreground">
          A moderator will look at this. Your report is private.
        </p>
        <ReportForm kind={kind} targetId={targetId} />
      </div>
    </main>
  )
}
