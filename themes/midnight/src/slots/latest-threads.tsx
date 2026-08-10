import type { LatestThreadsModel } from '@meith/theme-kit'

import { UserRef } from '../shared'

export function LatestThreads({ threads, capturedAt }: LatestThreadsModel) {
  return (
    <section aria-labelledby="latest-threads-heading" className="border border-border">
      <h2
        id="latest-threads-heading"
        className="border-b border-border bg-secondary px-3 py-1 font-mono text-xs uppercase tracking-wide"
      >
        Latest threads
      </h2>

      {threads.length === 0 ? (
        <p className="px-3 py-2 font-mono text-xs text-muted-foreground">nothing started yet</p>
      ) : (
        <ul className="divide-y divide-border font-mono text-xs">
          {threads.map((thread) => (
            <li key={thread.href} className="px-3 py-1.5">
              <a href={thread.href} className="text-primary hover:underline">
                {thread.title}
              </a>
              <span className="text-muted-foreground">
                {' · '}
                <a href={thread.forum.href} className="hover:text-foreground">
                  {thread.forum.label}
                </a>
                {' · '}
                <UserRef user={thread.author} className="hover:text-foreground" />
                {' · '}
                <time dateTime={thread.startedAt.iso}>{thread.startedAt.label}</time>
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="border-t border-border px-3 py-1 font-mono text-xs text-muted-foreground">
        as of <time dateTime={capturedAt.iso}>{capturedAt.label}</time>
      </p>
    </section>
  )
}
