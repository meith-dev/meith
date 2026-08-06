import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyTitle,
} from '@meith/ui'
import type { BoardStatsModel } from '@meith/theme-kit'

import { NUMERIC, Stamp, UserRef } from '../shared'

export function BoardStats({
  threadCount,
  postCount,
  memberCount,
  newestMember,
  computedAt,
}: BoardStatsModel) {
  return (
    <Card aria-labelledby="board-stats-heading">
      <CardHeader>
        <CardTitle id="board-stats-heading">Board statistics</CardTitle>
      </CardHeader>

      {computedAt === null ? (
        <Empty className="py-8">
          <EmptyTitle>Not counted yet</EmptyTitle>
          <EmptyDescription>
            The board totals are rolled up on a schedule, and the first run has not happened.
          </EmptyDescription>
        </Empty>
      ) : (
        <>
          <CardContent>
            <dl className="grid grid-cols-3 gap-3">
              {[
                { label: 'Threads', value: threadCount },
                { label: 'Posts', value: postCount },
                { label: 'Members', value: memberCount },
              ].map((figure) => (
                <div key={figure.label}>
                  <dd className={`text-xl font-semibold text-foreground ${NUMERIC}`}>
                    {figure.value.toLocaleString('en')}
                  </dd>
                  <dt className="text-xs text-muted-foreground">{figure.label}</dt>
                </div>
              ))}
            </dl>

            {newestMember !== null && (
              <p className="mt-3 border-t border-border pt-3 text-sm text-muted-foreground">
                Newest member: <UserRef user={newestMember} className="text-foreground" />
              </p>
            )}
          </CardContent>

          <CardFooter>
            <span>
              Counted <Stamp at={computedAt} />
            </span>
          </CardFooter>
        </>
      )}
    </Card>
  )
}
