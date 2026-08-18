import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { MOD_LOG_LABEL_KEYS, ModeratorPanel } from '@meith/moderation'
import { Card, CardFooter, CardRows, Empty, EmptyDescription, EmptyTitle } from '@meith/ui'

import { PanelPage } from '@/components/shell/panel-page'
import { PanelPagination } from '@/components/shell/panel-pagination'
import { getContainer } from '@/server/container'
import { getTranslator, tr } from '@/server/i18n'
import { resolveModCpAccess } from '@/server/modcp'
import { formatTime } from '@/view/time'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.moderator-log') }
}

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
  const translator = await getTranslator()

  return (
    <PanelPage
      title={await tr('page.moderator-log')}
      lede={await tr('page.scoped-forums-moderate-plus-own')}
    >
      <Card>
        {page.entries.length === 0 ? (
          <Empty className="py-8">
            <EmptyTitle>{await tr('page.nothing-has-been-logged-yet')}</EmptyTitle>
            <EmptyDescription>
              {await tr('page.approvals-locks-moves-deletions-forums')}
            </EmptyDescription>
          </Empty>
        ) : (
          <CardRows>
            {page.entries.map((entry) => {
              const at = formatTime(entry.at, now, translator)
              return (
                <li key={entry.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                    <span className="font-medium">
                      {translator.t(MOD_LOG_LABEL_KEYS[entry.action] ?? entry.action)}
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

        <CardFooter>
          <PanelPagination
            path="/modcp/log"
            params={query}
            cursorParams={['after']}
            nextCursor={
              page.nextCursor === undefined || page.nextCursor === null
                ? null
                : { after: String(page.nextCursor) }
            }
          />
        </CardFooter>
      </Card>
    </PanelPage>
  )
}
