import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { ModeratorPanel } from '@meith/moderation'

import { getContainer } from '@/server/container'
import { resolveModCpAccess } from '@/server/modcp'
import { memberHref } from '@/view/member-profile'
import { formatTime } from '@/view/time'

export const metadata: Metadata = { title: 'Address lookup' }

function positiveInt(value: string | undefined): number | null {
  if (value === undefined || !/^[1-9]\d*$/.test(value)) return null
  const n = Number(value)
  return Number.isSafeInteger(n) ? n : null
}

const MATCH_LABELS: Readonly<Record<string, string>> = {
  registration: 'registered from this range',
  last_visit: 'last visited from this range',
  both: 'registered and last visited from this range',
}

/**
 * F54 — the audited, separately-gated address lookup.
 *
 * Three things about this page are deliberate and worth reading before changing
 * it.
 *
 *  1. **It searches prefixes, and says so on screen.** F09 truncates every
 *     address before it is written, so there is no full address stored anywhere
 *     and no query that could match one. A moderator told "these accounts share
 *     an address" would act on a certainty the data does not support; told
 *     "these accounts share a range", they will go and check.
 *  2. **Every lookup is written to the log**, whether or not it found anything.
 *     A log that only records the productive ones cannot answer "who has been
 *     going through the membership".
 *  3. **It is a GET that writes.** Ordinarily that would be wrong — F32's mark-read
 *     is a POST for exactly this reason — but the thing being written is the
 *     audit row *for having asked*, and a prefetcher firing it records a true
 *     fact: this moderator's session requested this member's associations. The
 *     alternative, only auditing on POST, is a lookup you can perform without
 *     leaving a trace by typing a URL.
 */
export default async function IpLookupPage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string }>
}) {
  const access = await resolveModCpAccess()
  if (access === null || !access.canLookUpIp) notFound()

  const { modcp, warnings } = getContainer()
  if (modcp === null) notFound()

  const subjectId = positiveInt((await searchParams).user)
  const subject =
    subjectId === null || warnings === null ? null : await warnings.findWarnable(subjectId)

  const result =
    subject === null
      ? null
      : await new ModeratorPanel({ modcp }).lookUpIp({
          subjectUserId: subject.id,
          actorUserId: access.userId,
          rights: { access: true, ipLookup: access.canLookUpIp },
        })

  const now = new Date()

  return (
    <main id="board-content" tabIndex={-1} className="flex flex-col gap-5">
      <div>
        <h1 className="font-serif text-2xl font-semibold">Address lookup</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Finds accounts that share a stored address <em>range</em> with a member.
          The board never stores a full address, so this is evidence to follow up,
          not proof. Every lookup is recorded in the moderator log.
        </p>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Member id</span>
          <input
            type="number"
            name="user"
            min={1}
            defaultValue={subjectId ?? ''}
            className="h-9 w-40 rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
        </label>
        <button
          type="submit"
          className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Look up
        </button>
      </form>

      {subjectId !== null && subject === null && (
        <p className="text-sm text-muted-foreground">No such member.</p>
      )}

      {subject !== null && result !== null && (
        <section className="flex flex-col gap-3">
          <h2 className="font-serif text-lg font-semibold">
            Accounts sharing a range with{' '}
            <a href={memberHref(subject.id)} className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground">
              {subject.username}
            </a>
          </h2>
          <p className="text-xs text-muted-foreground">
            Ranges on record: registration{' '}
            <code>{result.prefixes.registration ?? 'none'}</code>, last visit{' '}
            <code>{result.prefixes.lastVisit ?? 'none'}</code>.
          </p>

          {result.matches.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No other account shares a recorded range.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {result.matches.map((match) => (
                <li
                  key={match.userId}
                  className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-border bg-card p-3 text-sm"
                >
                  <a
                    href={memberHref(match.userId)}
                    className="font-medium text-foreground hover:underline underline-offset-2"
                  >
                    {match.username}
                  </a>
                  <span className="text-xs text-muted-foreground">
                    {MATCH_LABELS[match.matchedOn] ?? match.matchedOn}
                    {match.lastActiveAt !== null && (
                      <>
                        {' '}
                        · last seen{' '}
                        <time dateTime={formatTime(match.lastActiveAt, now).iso}>
                          {formatTime(match.lastActiveAt, now).label}
                        </time>
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  )
}
