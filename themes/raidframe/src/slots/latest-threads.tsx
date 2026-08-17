import type { LatestThreadsModel } from '@meith/theme-kit'

import { Frame, MICRO, NUMERIC, PanelHead, Stamp, UserRef } from '../shared'

export function LatestThreads({ threads, capturedAt }: LatestThreadsModel) {
  return (
    <Frame aria-labelledby="latest-threads-heading">
      <PanelHead id="latest-threads-heading" title="Latest threads" />

      {threads.length === 0 ? (
        <p className={`${MICRO} px-3 py-2.5`}>nothing started yet</p>
      ) : (
        <ul className="divide-y divide-border">
          {threads.map((thread) => (
            <li key={thread.href} className="px-3 py-2 hover:bg-secondary/50">
              <a
                href={thread.href}
                className="block truncate text-xs text-foreground hover:text-primary"
              >
                {thread.title}
              </a>
              <p className={`${MICRO} mt-0.5 truncate normal-case`}>
                <a href={thread.forum.href} className="uppercase hover:text-primary">
                  {thread.forum.label}
                </a>
                <span className="text-border">{' | '}</span>
                <UserRef user={thread.author} className="hover:text-primary" />
              </p>
              <p className={`${MICRO} truncate normal-case`}>
                <Stamp at={thread.startedAt} />
                <span className="text-border">{' | '}</span>
                <span className={NUMERIC}>{thread.replyCount.label}</span>
                <span className="uppercase"> replies</span>
              </p>
            </li>
          ))}
        </ul>
      )}

      <p className={`${MICRO} border-t border-border px-3 py-1.5 normal-case`}>
        <span className="uppercase">as of</span> <Stamp at={capturedAt} />
      </p>
    </Frame>
  )
}
