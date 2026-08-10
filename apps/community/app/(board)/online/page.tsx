import type { Metadata } from 'next'

import { getActor } from '@/server/context'
import { readOnline, presenceRepository } from '@/server/presence'
import { getViewerPreferences } from '@/server/viewer-preferences'
import { identitiesFor } from '@/server/group-identity'
import { locationOf } from '@/view/presence'
import { formatTime } from '@/view/time'

export const metadata: Metadata = { title: "Who's online" }

export default async function OnlinePage() {
  const actor = await getActor()
  const now = new Date()
  const preferences = await getViewerPreferences()

  const snapshot = await readOnline(actor, now)
  const repo = presenceRepository()
  const record = repo === null ? { count: 0, at: null } : await repo.readRecord()

  if (snapshot === null) {
    return (
      <main id="board-content" tabIndex={-1} className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 py-8 flex-1">
        <h1 className="font-heading text-2xl font-semibold">Who&rsquo;s online</h1>
        <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
          This board is not tracking who is online.
        </p>
      </main>
    )
  }

  const identities = await identitiesFor(snapshot.members.map((member) => member.userId))

  return (
    <main id="board-content" tabIndex={-1} className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8 flex-1">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold">Who&rsquo;s online</h1>
        <p className="text-sm text-muted-foreground">
          {snapshot.total.toLocaleString()} here in the last 15 minutes —{' '}
          {snapshot.members.length.toLocaleString()}{' '}
          {snapshot.members.length === 1 ? 'member' : 'members'} and{' '}
          {snapshot.guestCount.toLocaleString()}{' '}
          {snapshot.guestCount === 1 ? 'guest' : 'guests'}.
          {snapshot.invisibleCount > 0 &&
            ` ${snapshot.invisibleCount.toLocaleString()} browsing invisibly.`}
        </p>
      </div>

      {snapshot.members.length === 0 ? (
        <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
          No members are online right now.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {snapshot.members.map((member) => {
            const where = locationOf(member)
            return (
              <li
                key={member.userId}
                className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
              >
                <span className="text-sm font-medium">
                  <a
                    href={`/member/${member.userId}`}
                    className={`font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground ${
                      identities.get(member.userId)?.nameClass ?? ''
                    }`}
                  >
                    {member.username}
                  </a>
                  {member.invisible && (
                    <span className="ml-1 text-xs text-muted-foreground">(invisible)</span>
                  )}
                </span>

                <span className="text-xs text-muted-foreground">
                  {where.href === null ? (
                    where.label
                  ) : (
                    <a href={where.href} className="hover:underline">
                      {where.label}
                    </a>
                  )}
                  {' · '}
                  <time dateTime={member.lastSeenAt.toISOString()}>
                    {formatTime(member.lastSeenAt, now, preferences.timezone).label}
                  </time>
                </span>
              </li>
            )
          })}
        </ul>
      )}

      {record.at !== null && (
        <p className="text-sm text-muted-foreground">
          Most ever online: {record.count.toLocaleString()} on{' '}
          <time dateTime={record.at.toISOString()}>
            {formatTime(record.at, now, preferences.timezone).label}
          </time>
          .
        </p>
      )}
    </main>
  )
}
