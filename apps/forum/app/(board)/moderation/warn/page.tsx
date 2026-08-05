import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { WarningService } from '@meith/moderation'
import { requireSlot } from '@meith/theme-kit'

import {
  IssueWarningForm,
  RevokeWarningForm,
} from '@/components/moderation/warning-forms'
import { getContainer } from '@/server/container'
import { getActor } from '@/server/context'
import { currentTheme } from '@/server/theme'
import { buildWarningView, warningNotice } from '@/view/warnings'

export const metadata: Metadata = { title: 'Warn a member' }

function positiveInt(value: string | undefined): number | null {
  if (value === undefined || !/^[1-9]\d*$/.test(value)) return null
  const n = Number(value)
  return Number.isSafeInteger(n) ? n : null
}

/**
 * F53 — one member's warning record, and the form that adds to it.
 *
 * The record and the form are one screen on purpose. A moderator about to warn
 * somebody needs to know what they have already been warned for — issuing a
 * second three-point warning for the same thing, unaware of the first, is how a
 * ladder that ends in a ban gets climbed by accident.
 *
 * App-owned rather than a theme slot, for F48's reason: the slot registry is
 * R6's list, frozen at F77, and a moderator tool is an operator surface. The
 * theme still supplies everything around it.
 */
export default async function WarnPage({
  searchParams,
}: {
  searchParams: Promise<{
    user?: string
    post?: string
    after?: string
    warned?: string
    level?: string
    revoked?: string
  }>
}) {
  const query = await searchParams
  const userId = positiveInt(query.user)
  if (userId === null) notFound()

  const actor = await getActor()
  const { authorizer, warnings, warningBans } = getContainer()
  /*
   * Fixture mode has no warning store, and a guest or a member without
   * `user.warn` gets the same answer: this page is not here. Not a 403 — the
   * existence of a moderator screen is not something to confirm to somebody who
   * may not use it.
   */
  if (warnings === null || actor.userId === null || !authorizer.can(actor, 'user.warn')) {
    notFound()
  }

  const service = new WarningService({ warnings, bans: warningBans })
  const member = await warnings.findWarnable(userId)
  if (member === null) notFound()

  const [standing, types, history] = await Promise.all([
    service.standingFor(userId),
    service.listTypes(),
    service.history(userId, query.after === undefined ? {} : { after: query.after }),
  ])

  /*
   * The cited post, validated against *this* member. `?post=` is a URL
   * parameter, and a warning whose evidence is somebody else's post is a record
   * that says the wrong thing — the action re-checks it too, because a form
   * field is not authorisation.
   */
  const citedPost = positiveInt(query.post)
  const postId =
    citedPost !== null && (await warnings.findPostAuthor(citedPost)) === userId
      ? citedPost
      : null

  const view = buildWarningView({
    member: { userId: member.id, username: member.username },
    standing,
    types,
    history: history.rows,
    ...(history.nextCursor === undefined ? {} : { nextCursor: history.nextCursor }),
    now: new Date(),
  })

  const Notice = requireSlot(await currentTheme(), 'Notice')
  const notice = warningNotice(query)

  return (
    <main id="board-content" tabIndex={-1} className="flex-1">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8">
        {notice !== null && (
          <Notice
            kind="info"
            message={notice}
            dismissHref={`/moderation/warn?user=${view.member.userId}`}
          />
        )}

        <div>
          <h1 className="font-serif text-2xl font-semibold">
            Warnings for{' '}
            <a href={view.member.href} className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground">
              {view.member.username}
            </a>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {view.standing.points} {view.standing.points === 1 ? 'point' : 'points'}
            {view.standing.levelLabel === null
              ? '. No threshold reached.'
              : ` — ${view.standing.levelLabel} at ${view.standing.levelPoints}.`}
          </p>
        </div>

        <IssueWarningForm
          userId={view.member.userId}
          username={view.member.username}
          postId={postId}
          types={view.types}
        />

        <section className="flex flex-col gap-3">
          <h2 className="font-serif text-lg font-semibold">History</h2>
          {view.history.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              This member has never been warned.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {view.history.map((row) => (
                <li key={row.id} className="rounded-lg border border-border bg-card p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-medium">
                      {row.title} — {row.points}{' '}
                      {row.points === 1 ? 'point' : 'points'}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      by {row.issuedBy} ·{' '}
                      <time dateTime={row.issuedAt.iso}>{row.issuedAt.label}</time>
                    </span>
                  </div>
                  {/*
                    Plain text, never markup. A warning reason is written by a
                    moderator about a member and is not a post; rendering it as
                    Markdown would give it capabilities the box never advertised.
                  */}
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm">{row.reason}</p>
                  {row.postId !== null && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      About post #{row.postId}
                    </p>
                  )}
                  {row.lapsed === null ? (
                    <div className="mt-3">
                      <RevokeWarningForm warningId={row.id} userId={view.member.userId} />
                    </div>
                  ) : (
                    <p className="mt-2 text-xs italic text-muted-foreground">{row.lapsed}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
          {view.nextHref !== null && (
            <a href={view.nextHref} className="text-sm font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground">
              Older warnings
            </a>
          )}
        </section>
      </div>
    </main>
  )
}
