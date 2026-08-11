import type { LatestThreadsModel } from '@meith/theme-kit'

import { Circle, MUTED_LINK, NUMERIC, Rail, Stamp, UserRef, count, plural } from '../shared'

export function LatestThreads({ threads, capturedAt }: LatestThreadsModel) {
  return (
    <Rail
      title="Latest threads"
      titleId="latest-threads-heading"
      action={
        <span className={`text-xs text-muted-foreground ${NUMERIC}`}>
          <Stamp at={capturedAt} />
        </span>
      }
    >
      {threads.length === 0 ? (
        <p className="px-3 pt-1 pb-3 text-xs text-muted-foreground">
          The newest threads you can see will appear here.
        </p>
      ) : (
        <ul className="px-1 pt-1 pb-1">
          {threads.map((thread) => (
            <li key={thread.href} className="rounded-sm px-2 py-1.5 transition-colors hover:bg-accent">
              <div className="flex items-start gap-2.5">
                <Circle name={thread.author.username} size={28} className="mt-0.5" />

                <div className="min-w-0 flex-1">
                  <a
                    href={thread.href}
                    className="line-clamp-2 text-sm font-medium text-foreground hover:underline"
                  >
                    {thread.title}
                  </a>

                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    <UserRef user={thread.author} className="text-xs" />
                    {' in '}
                    <a href={thread.forum.href} className={MUTED_LINK}>
                      #{thread.forum.label}
                    </a>
                  </p>

                  <p className={`mt-0.5 truncate text-xs text-muted-foreground ${NUMERIC}`}>
                    {count(thread.replyCount)} {plural(thread.replyCount, 'reply', 'replies')} ·{' '}
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
