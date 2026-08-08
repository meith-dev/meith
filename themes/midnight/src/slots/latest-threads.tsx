import type { LatestThreadsModel } from '@meith/theme-kit'

import { UserRef } from '../shared'

/**
 * The newest threads, as a log.
 *
 * Midnight renders listings as rows of monospace rather than as cards, and this
 * panel is the same idea at one line per thread: title, then the community and the
 * author in the muted colour, then the time. No excerpt and no reply count —
 * the point of a log is that the lines are the same shape, and a wrapped one
 * breaks the column this theme is made of.
 *
 * `capturedAt` is rendered rather than dropped. The panel updates itself while
 * the page is open, and a list that changes with nothing saying when it was
 * read is indistinguishable from one that has stopped.
 */
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
                <a href={thread.community.href} className="hover:text-foreground">
                  {thread.community.label}
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
