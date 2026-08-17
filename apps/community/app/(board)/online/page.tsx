import type { Metadata } from 'next'

import { Card, CardFooter, CardRows, Empty, EmptyDescription, EmptyTitle } from '@meith/ui'

import { PanelPage } from '@/components/shell/panel-page'
import { getActor } from '@/server/context'
import { identitiesFor } from '@/server/group-identity'
import { getTranslator, tr } from '@/server/i18n'
import { presenceRepository, readOnline } from '@/server/presence'
import { locationOf } from '@/view/presence'
import { formatTime } from '@/view/time'

export const metadata: Metadata = { title: "Who's online" }

export default async function OnlinePage() {
  const actor = await getActor()
  const now = new Date()
  const translator = await getTranslator()

  const snapshot = await readOnline(actor, now)
  const repo = presenceRepository()
  const record = repo === null ? { count: 0, at: null } : await repo.readRecord()

  if (snapshot === null) {
    return (
      <PanelPage frame="standalone" title={await tr('page.who-s-online')}>
        <Card>
          <Empty>
            <EmptyTitle>{await tr('page.nobody-counted-here')}</EmptyTitle>
            <EmptyDescription>{await tr('page.this-board-not-tracking-who')}</EmptyDescription>
          </Empty>
        </Card>
      </PanelPage>
    )
  }

  const identities = await identitiesFor(snapshot.members.map((member) => member.userId))

  return (
    <PanelPage
      frame="standalone"
      title={await tr('page.who-s-online')}
      lede={
        <>
          {translator.t('presence.summary', {
            total: snapshot.total,
            members: snapshot.members.length,
            guests: snapshot.guestCount,
          })}
          {snapshot.invisibleCount > 0 &&
            ` ${translator.t('presence.invisible', { count: snapshot.invisibleCount })}`}
        </>
      }
    >
      <Card>
        {snapshot.members.length === 0 ? (
          <Empty>
            <EmptyTitle>{await tr('page.nobody-here')}</EmptyTitle>
            <EmptyDescription>{await tr('page.no-members-online-right-now')}</EmptyDescription>
          </Empty>
        ) : (
          <CardRows>
            {snapshot.members.map((member) => {
              const where = locationOf(member, translator)
              return (
                <li
                  key={member.userId}
                  className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
                >
                  <span className="text-sm font-medium">
                    <a
                      href={`/member/${member.userId}`}
                      className={`font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground ${
                        identities.get(member.userId)?.nameClass ?? ''
                      }`}
                    >
                      {member.username}
                    </a>
                    {member.invisible && (
                      <span className="ml-1 text-xs text-muted-foreground">(invisible)</span>
                    )}
                  </span>

                  <span className="text-xs text-muted-foreground">
                    {where.href === null ? (
                      where.label
                    ) : (
                      <a href={where.href} className="hover:underline">
                        {where.label}
                      </a>
                    )}
                    {' · '}
                    <time dateTime={member.lastSeenAt.toISOString()}>
                      {formatTime(member.lastSeenAt, now, translator).label}
                    </time>
                  </span>
                </li>
              )
            })}
          </CardRows>
        )}

        {record.at !== null && (
          <CardFooter>
            Most ever online: {translator.number(record.count)} on{' '}
            <time dateTime={record.at.toISOString()}>
              {formatTime(record.at, now, translator).label}
            </time>
            .
          </CardFooter>
        )}
      </Card>
    </PanelPage>
  )
}
