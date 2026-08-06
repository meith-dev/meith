import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { MOD_LOG_LABELS, ModeratorPanel } from '@meith/moderation'

import { getContainer } from '@/server/container'
import { resolveModCpAccess } from '@/server/modcp'
import { formatTime } from '@/view/time'

export const metadata: Metadata = { title: 'Moderator log' }

export default async function ModLogPage({
  searchParams,
}: {
  searchParams: Promise<{ after?: string }>
}) {
  const query = await searchParams
  const access = await resolveModCpAccess()
  if (access === null) notFound()

  const { modcp } = getContainer()
  if (modcp === null) notFound()

  const page = await new ModeratorPanel({ modcp }).log({
    forumIds: access.forumIds,
    actorUserId: access.userId,
    ...(query.after === undefined ? {} : { after: query.after }),
  })
  const now = new Date()

  return (
    <main id="board-content" tabIndex={-1} className="flex flex-col gap-4">
      <h1 className="font-serif text-2xl font-semibold">Moderator log</h1>

      {page.entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing has been logged yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {page.entries.map((entry) => {
            const at = formatTime(entry.at, now)
            return (
              <li key={entry.id} className="rounded-lg border border-border bg-card p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium">
                    { }
                    {MOD_LOG_LABELS[entry.action] ?? entry.action}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {entry.actorUsername ?? 'a former moderator'}
                    {entry.forumTitle !== null && <> in {entry.forumTitle}</>} ·{' '}
                    <time dateTime={at.iso}>{at.label}</time>
                  </span>
                </div>
                {entry.detail.length > 0 && (
                  <dl className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {entry.detail.map((item) => (
                      <div key={item.label} className="flex gap-1">
                        <dt>{item.label}:</dt>
                        <dd className="break-all">{item.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {page.nextCursor !== undefined && (
        <a
          href={`/modcp/log?after=${encodeURIComponent(page.nextCursor)}`}
          className="text-sm font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
        >
          Older entries
        </a>
      )}
    </main>
  )
}
