import type { BoardStatsModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'
import { Card, CardContent, CardHeader, CardTitle } from '@meith/ui'

import { NUMERIC, PRIMARY_HEADER, Stamp, UserRef } from '../shared'

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
    <Card aria-labelledby="board-stats-heading">
      <CardHeader className={PRIMARY_HEADER}>
        <CardTitle id="board-stats-heading" className="text-primary">
          {c('heading')}
        </CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
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
                <div key={figure.label}>
                  <dd className={`text-sm font-medium text-foreground ${NUMERIC}`}>
                    {figure.value.label}
                  </dd>
                  <dt className="text-xs text-muted-foreground">{figure.label}</dt>
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
