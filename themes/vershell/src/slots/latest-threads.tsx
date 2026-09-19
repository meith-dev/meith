import type { LatestThreadsModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

import { CARD, Label, META, NUMERIC, QUIET_LINK, RULE, Stamp, UserRef } from '../shared'

export function LatestThreads({
  threads,
  capturedAt,
  copy,
}: LatestThreadsModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `vershell.latestThreads.${key}`)

  return (
    <section aria-labelledby="latest-threads-heading" className={`${CARD} px-5 pt-5 pb-2`}>
      <div className="flex items-baseline justify-between gap-4">
        <Label as="h2" id="latest-threads-heading">
          {c('heading')}
        </Label>
        <p className={`${META} ${NUMERIC} text-xs`}>
          {c('asOf')} <Stamp at={capturedAt} />
        </p>
      </div>

      {threads.length === 0 ? (
        <div className="py-6">
          <p className="text-[0.9375rem] font-medium text-foreground">{c('nothingYet')}</p>
          <p className={`${META} mt-1`}>{c('emptyDescription')}</p>
        </div>
      ) : (
        <ul className="mt-2">
          {threads.map((thread) => (
            <li key={thread.href} className={`${RULE} flex flex-col gap-0.5 py-3 first:border-t-0`}>
              <div className="flex items-baseline justify-between gap-3">
                <a
                  href={thread.href}
                  className={`line-clamp-2 text-[0.9rem] font-medium text-foreground ${QUIET_LINK}`}
                >
                  {thread.title}
                </a>
                <span className={`${NUMERIC} shrink-0 text-xs text-primary`}>
                  {thread.replyCount.label}
                  <span className="sr-only">
                    {' '}
                    {thread.replyCount.value === 1 ? c('reply.one') : c('reply.other')}
                  </span>
                </span>
              </div>

              <p className={`${META} truncate text-xs`}>
                <UserRef user={thread.author} className="font-normal text-muted-foreground" />{' '}
                {c('in')}{' '}
                <a href={thread.forum.href} className={QUIET_LINK}>
                  {thread.forum.label}
                </a>{' '}
                <span aria-hidden="true" className="text-input">
                  {c('dot')}
                </span>{' '}
                <Stamp at={thread.startedAt} />
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
