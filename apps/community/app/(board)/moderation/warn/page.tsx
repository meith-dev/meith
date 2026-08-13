import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { WarningService } from '@meith/moderation'
import { requireSlot } from '@meith/theme-kit'
import { Card, Empty, EmptyDescription, EmptyTitle } from '@meith/ui'

import { PanelPage, PanelSection } from '@/components/shell/panel-page'
import {
  IssueWarningForm,
  RevokeWarningForm,
} from '@/components/moderation/warning-forms'
import { getContainer } from '@/server/container'
import { getActor } from '@/server/context'
import { currentTheme } from '@/server/theme'
import { getViewerPreferences } from '@/server/viewer-preferences'
import { buildWarningView, warningNotice } from '@/view/warnings'

export const metadata: Metadata = { title: 'Warn a member' }

function positiveInt(value: string | undefined): number | null {
  if (value === undefined || !/^[1-9]\d*$/.test(value)) return null
  const n = Number(value)
  return Number.isSafeInteger(n) ? n : null
}

export default async function WarnPage({
  searchParams,
}: {
  searchParams: Promise<{
    user?: string
    post?: string
    after?: string
    warned?: string
    level?: string
    revoked?: string
  }>
}) {
  const query = await searchParams
  const userId = positiveInt(query.user)
  if (userId === null) notFound()

  const actor = await getActor()
  const { authorizer, warnings, warningBans } = getContainer()
  if (warnings === null || actor.userId === null || !authorizer.can(actor, 'user.warn')) {
    notFound()
  }

  const service = new WarningService({ warnings, bans: warningBans })
  const member = await warnings.findWarnable(userId)
  if (member === null) notFound()

  const [standing, types, history] = await Promise.all([
    service.standingFor(userId),
    service.listTypes(),
    service.history(userId, query.after === undefined ? {} : { after: query.after }),
  ])

  const citedPost = positiveInt(query.post)
  const postId =
    citedPost !== null && (await warnings.findPostAuthor(citedPost)) === userId
      ? citedPost
      : null

  const { timezone } = await getViewerPreferences()

  const view = buildWarningView({
    member: { userId: member.id, username: member.username },
    standing,
    types,
    history: history.rows,
    ...(history.nextCursor === undefined ? {} : { nextCursor: history.nextCursor }),
    now: new Date(),
    timeZone: timezone,
  })

  const Notice = requireSlot(await currentTheme(), 'Notice')
  const notice = warningNotice(query)

  return (
    <PanelPage
      title={
        <>
          Warnings for{' '}
          <a
            href={view.member.href}
            className="underline decoration-border underline-offset-2 hover:decoration-foreground"
          >
            {view.member.username}
          </a>
        </>
      }
      lede={
        <>
          {view.standing.points} {view.standing.points === 1 ? 'point' : 'points'}
          {view.standing.levelLabel === null
            ? '. No threshold reached.'
            : ` — ${view.standing.levelLabel} at ${view.standing.levelPoints}.`}
        </>
      }
    >
      {notice !== null && (
        <Notice
          kind="info"
          message={notice}
          dismissHref={`/moderation/warn?user=${view.member.userId}`}
        />
      )}

      <IssueWarningForm
        userId={view.member.userId}
        username={view.member.username}
        postId={postId}
        types={view.types}
      />

      <PanelSection id="history-heading" title="History">
        {view.history.length === 0 ? (
          <Card>
            <Empty className="py-8">
              <EmptyTitle>Never warned</EmptyTitle>
              <EmptyDescription>
                This member has no warning on record — nothing issued, and nothing lapsed.
              </EmptyDescription>
            </Empty>
          </Card>
        ) : (
          <ul className="flex flex-col gap-3">
            {view.history.map((row) => (
              <li
                key={row.id}
                className="rounded-lg border border-border bg-card p-4 text-card-foreground shadow-elevation"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">
                    {row.title} — {row.points} {row.points === 1 ? 'point' : 'points'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    by {row.issuedBy} ·{' '}
                    <time dateTime={row.issuedAt.iso}>{row.issuedAt.label}</time>
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm">
                  {row.reason}
                </p>
                {row.postId !== null && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    About post #{row.postId}
                  </p>
                )}
                {row.lapsed === null ? (
                  <div className="mt-3">
                    <RevokeWarningForm warningId={row.id} userId={view.member.userId} />
                  </div>
                ) : (
                  <p className="mt-2 text-xs italic text-muted-foreground">
                    {row.lapsed}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}

        {view.nextHref !== null && (
          <a
            href={view.nextHref}
            className="text-sm font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
          >
            Older warnings
          </a>
        )}
      </PanelSection>
    </PanelPage>
  )
}
