import type { LatestThreadsModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

import { Circle, count, MUTED_LINK, NUMERIC, plural, Rail, Stamp, UserRef } from '../shared'

export function LatestThreads({
  threads,
  capturedAt,
  copy,
}: LatestThreadsModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `phasebook.latestThreads.${key}`)

  return (
    <Rail
      title={c('title')}
      titleId="latest-threads-heading"
      action={
        <span className={`text-xs text-muted-foreground ${NUMERIC}`}>
          <Stamp at={capturedAt} />
        </span>
      }
    >
      {threads.length === 0 ? (
        <p className="px-3 pt-1 pb-3 text-xs text-muted-foreground">{c('empty')}</p>
      ) : (
        <ul className="px-1 pt-1 pb-1">
          {threads.map((thread) => (
            <li
              key={thread.href}
              className="rounded-lg px-2 py-1.5 transition-colors hover:bg-accent"
            >
              <div className="flex items-start gap-2.5">
                <Circle name={thread.author.username} size={32} className="mt-0.5" />

                <div className="min-w-0 flex-1">
                  <a
                    href={thread.href}
                    className="line-clamp-2 text-sm font-semibold text-foreground hover:underline"
                  >
                    {thread.title}
                  </a>

                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    <UserRef user={thread.author} className="text-xs font-medium" />
                    {' in '}
                    <a href={thread.forum.href} className={MUTED_LINK}>
                      {thread.forum.label}
                    </a>
                  </p>

                  <p className={`mt-0.5 truncate text-xs text-muted-foreground ${NUMERIC}`}>
                    {count(thread.replyCount)}{' '}
                    {plural(thread.replyCount, c('reply.one'), c('reply.other'))} ·{' '}
                    <Stamp at={thread.startedAt} />
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Rail>
  )
}
