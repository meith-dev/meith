import type { LatestThreadsModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

import { UserRef } from '../shared'

export function LatestThreads({
  threads,
  capturedAt,
  copy,
}: LatestThreadsModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `midnight.latestThreads.${key}`)

  return (
    <section aria-labelledby="latest-threads-heading" className="border border-border">
      <h2
        id="latest-threads-heading"
        className="border-b border-border bg-secondary px-3 py-1 font-mono text-xs uppercase tracking-wide"
      >
        {c('heading')}
      </h2>

      {threads.length === 0 ? (
        <p className="px-3 py-2 font-mono text-xs text-muted-foreground">{c('empty')}</p>
      ) : (
        <ul className="divide-y divide-border font-mono text-xs">
          {threads.map((thread) => (
            <li key={thread.href} className="px-3 py-1.5">
              <a href={thread.href} className="block truncate text-primary hover:underline">
                {thread.title}
              </a>
              <p className="truncate text-muted-foreground">
                <a href={thread.forum.href} className="hover:text-foreground">
                  {thread.forum.label}
                </a>
                {' · '}
                <UserRef user={thread.author} className="hover:text-foreground" />
                {' · '}
                <time dateTime={thread.startedAt.iso}>{thread.startedAt.label}</time>
              </p>
            </li>
          ))}
        </ul>
      )}

      <p className="border-t border-border px-3 py-1 font-mono text-xs text-muted-foreground">
        {c('asOf')} <time dateTime={capturedAt.iso}>{capturedAt.label}</time>
      </p>
    </section>
  )
}
