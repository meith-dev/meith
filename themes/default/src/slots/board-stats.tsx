import type { BoardStatsModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'
import { Card, CardContent, CardHeader, CardTitle } from '@meith/ui'

import { NUMERIC, Stamp, UserRef } from '../shared'

export function BoardStats({
  threadCount,
  postCount,
  memberCount,
  newestMember,
  computedAt,
  copy,
}: BoardStatsModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `default.boardStats.${key}`)

  return (
    <Card aria-labelledby="board-stats-heading" className="rounded-xl">
      <CardHeader className="bg-card">
        <CardTitle id="board-stats-heading" className="text-sm">
          {c('heading')}
        </CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-3 px-5 py-4">
        {computedAt === null ? (
          <p className="text-xs text-muted-foreground">{c('notComputed')}</p>
        ) : (
          <>
            <dl className="grid grid-cols-3 gap-2 text-center">
              {[
                { label: c('threads'), value: threadCount },
                { label: c('posts'), value: postCount },
                { label: c('members'), value: memberCount },
              ].map((figure) => (
                <div key={figure.label} className="rounded-lg bg-muted/60 px-2 py-2.5">
                  <dd className={`text-lg font-semibold text-foreground ${NUMERIC}`}>
                    {figure.value.label}
                  </dd>
                  <dt className="text-[0.6875rem] text-muted-foreground uppercase">
                    {figure.label}
                  </dt>
                </div>
              ))}
            </dl>

            {newestMember !== null && (
              <p className="text-xs text-muted-foreground">
                {c('newestMember')} <UserRef user={newestMember} />
              </p>
            )}

            <p className={`text-xs text-muted-foreground ${NUMERIC}`}>
              {c('counted')} <Stamp at={computedAt} />
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
