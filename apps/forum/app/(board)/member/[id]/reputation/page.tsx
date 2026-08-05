import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { requireSlot } from '@meith/theme-kit'

import {
  RateMemberForm,
  WithdrawRatingForm,
} from '@/components/account/reputation-forms'
import { getContainer } from '@/server/container'
import { getActor } from '@/server/context'
import {
  reputationService,
  reputationSettings,
  viewerRaterLimits,
} from '@/server/reputation'
import { currentTheme } from '@/server/theme'
import { getViewerPreferences } from '@/server/viewer-preferences'
import { buildReputationView, reputationLabel, reputationNotice } from '@/view/reputation'

export const metadata: Metadata = { title: 'Reputation' }

function memberId(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null
  const id = Number(value)
  return Number.isSafeInteger(id) ? id : null
}

/**
 * F62 — one member's reputation, and the form for adding to it.
 *
 * Its own route rather than a section of the profile, because it is a *history*
 * — it pages, and a profile that grew a pager for one of its sections would
 * have to page the rest of itself too.
 *
 * The whole screen is absent when reputation is switched off. Existing ratings
 * are kept (the setting hides, it does not delete), so switching it back on
 * restores them exactly.
 */
export default async function ReputationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{
    before?: string
    post?: string
    rated?: string
    withdrawn?: string
  }>
}) {
  const id = memberId((await params).id)
  if (id === null) notFound()

  const query = await searchParams
  const actor = await getActor()
  const { authorizer, memberProfiles } = getContainer()
  if (!authorizer.can(actor, 'profile.view')) notFound()

  const service = reputationService()
  const settings = await reputationSettings()
  if (service === null || !settings.enabled) notFound()

  const profile = await memberProfiles.findPublicById(id)
  if (!profile) notFound()

  const before = Number(query.before)
  /*
   * F62. `?post=` comes from the postbit's Rate link, and it attaches the
   * rating to *that post* rather than to the author generally — which is what
   * makes "one rating per post" a meaningful rule rather than a second way to
   * say the same thing.
   */
  const ratedPost = Number(query.post)
  const postId = Number.isInteger(ratedPost) && ratedPost > 0 ? ratedPost : null
  const preferences = await getViewerPreferences()

  const [summary, history, limits] = await Promise.all([
    service.summary(id),
    service.history({
      userId: id,
      ...(Number.isInteger(before) && before > 0 ? { before } : {}),
    }),
    viewerRaterLimits(),
  ])

  /*
   * Two reads only for somebody who could actually rate: what they said last
   * time, so the form starts from it, and how many they have left today. A
   * guest and a member without the permission pay for neither.
   */
  const mayRate = limits.canGive && actor.userId !== null && actor.userId !== id
  const [existing, givenToday] = mayRate
    ? await Promise.all([
        service.existing({ givenByUserId: actor.userId as number, userId: id, postId }),
        service.givenToday(actor.userId as number),
      ])
    : [null, 0]

  const view = buildReputationView({
    userId: id,
    summary,
    rows: history.rows,
    nextBefore: history.nextBefore,
    viewerUserId: actor.userId,
    maxPerDay: limits.maxPerDay,
    givenToday,
    now: new Date(),
    timeZone: preferences.timezone,
  })

  const Notice = requireSlot(await currentTheme(), 'Notice')
  const notice = reputationNotice(query)
  const returnTo = `/member/${id}/reputation`

  return (
    <main id="board-content" tabIndex={-1} className="flex-1">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8">
        {notice !== null && (
          <Notice kind={notice.kind} message={notice.message} dismissHref={returnTo} />
        )}

        <div className="flex flex-col gap-1">
          <h1 className="font-serif text-2xl font-semibold">
            {profile.username}&rsquo;s reputation
          </h1>
          <p className="text-sm text-muted-foreground">{reputationLabel(view.summary)}</p>
          <a href={`/member/${id}`} className="text-sm font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground">
            Back to their profile
          </a>
        </div>

        {mayRate && (
          <RateMemberForm
            userId={id}
            username={profile.username}
            postId={postId}
            returnTo={returnTo}
            allowNegative={settings.allowNegative}
            commentRequired={settings.commentRequired}
            existingComment={existing?.comment ?? null}
            existingPoints={existing?.points ?? null}
            remainingLabel={view.remainingLabel}
          />
        )}

        {view.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody has rated them yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {view.rows.map((row) => (
              <li key={row.id} className="flex flex-col gap-1 px-4 py-3">
                <div className="flex flex-wrap items-baseline gap-2 text-sm">
                  <span
                    className={
                      row.points > 0
                        ? 'font-semibold text-moderation-approved'
                        : row.points < 0
                          ? 'font-semibold text-destructive'
                          : 'font-semibold text-muted-foreground'
                    }
                  >
                    {/* A word as well as a colour: a colour difference alone is
                        not a distinction everybody can see. */}
                    {row.pointsLabel}
                  </span>
                  {row.givenByHref === null ? (
                    <span className="font-medium">{row.givenBy}</span>
                  ) : (
                    <a href={row.givenByHref} className="font-medium text-foreground hover:underline underline-offset-2">
                      {row.givenBy}
                    </a>
                  )}
                  <time dateTime={row.at.iso} className="text-xs text-muted-foreground">
                    {row.at.label}
                  </time>
                  {row.postHref !== null && (
                    <a href={row.postHref} className="text-xs font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground">
                      on a post
                    </a>
                  )}
                  {row.isMine && (
                    <span className="ml-auto">
                      <WithdrawRatingForm ratingId={row.id} userId={id} returnTo={returnTo} />
                    </span>
                  )}
                </div>

                {/* The comment is plain text, always. It is somebody else's
                    words on a page every member can visit. */}
                {row.comment !== '' && (
                  <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
                    {row.comment}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}

        {view.nextHref !== null && (
          <a href={view.nextHref} className="text-sm font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground">
            Older ratings
          </a>
        )}
      </div>
    </main>
  )
}
