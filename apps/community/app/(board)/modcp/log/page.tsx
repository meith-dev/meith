import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { MOD_LOG_LABELS, ModeratorPanel } from '@meith/moderation'
import {
  Card,
  CardFooter,
  CardRows,
  Empty,
  EmptyDescription,
  EmptyTitle,
} from '@meith/ui'

import { PanelPage } from '@/components/shell/panel-page'
import { getContainer } from '@/server/container'
import { resolveModCpAccess } from '@/server/modcp'
import { getViewerPreferences } from '@/server/viewer-preferences'
import { formatTime } from '@/view/time'

export const metadata: Metadata = { title: 'Moderator log' }

export default async function ModLogPage({
  searchParams,
}: {
  searchParams: Promise<{ after?: string }>
}) {
  const query = await searchParams
  const access = await resolveModCpAccess()
  if (access === null) notFound()

  const { modcp } = getContainer()
  if (modcp === null) notFound()

  const page = await new ModeratorPanel({ modcp }).log({
    forumIds: access.forumIds,
    actorUserId: access.userId,
    ...(query.after === undefined ? {} : { after: query.after }),
  })
  const now = new Date()
  const { timezone } = await getViewerPreferences()

  return (
    <PanelPage
      title="Moderator log"
      lede="Scoped to the forums you moderate, plus your own actions elsewhere."
    >
      <Card>
        {page.entries.length === 0 ? (
          <Empty className="py-8">
            <EmptyTitle>Nothing has been logged yet</EmptyTitle>
            <EmptyDescription>
              Approvals, locks, moves and deletions in your forums appear here as they
              happen.
            </EmptyDescription>
          </Empty>
        ) : (
          <CardRows>
            {page.entries.map((entry) => {
              const at = formatTime(entry.at, now, timezone)
              return (
                <li key={entry.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                    <span className="font-medium">
                      {MOD_LOG_LABELS[entry.action] ?? entry.action}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {entry.actorUsername ?? 'a former moderator'}
                      {entry.forumTitle !== null && <> in {entry.forumTitle}</>} ·{' '}
                      <time dateTime={at.iso}>{at.label}</time>
                    </span>
                  </div>
                  {entry.detail.length > 0 && (
                    <dl className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {entry.detail.map((item) => (
                        <div key={item.label} className="flex gap-1">
                          <dt>{item.label}:</dt>
                          <dd className="break-all">{item.value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </li>
              )
            })}
          </CardRows>
        )}

        {page.nextCursor !== undefined && (
          <CardFooter>
            <a
              href={`/modcp/log?after=${encodeURIComponent(page.nextCursor)}`}
              className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
            >
              Older entries
            </a>
          </CardFooter>
        )}
      </Card>
    </PanelPage>
  )
}
