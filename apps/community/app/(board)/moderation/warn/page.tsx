import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { WarningService } from '@meith/moderation'
import { Card, Empty, EmptyDescription, EmptyTitle, TextLink } from '@meith/ui'

import { IssueWarningForm, RevokeWarningForm } from '@/components/moderation/warning-forms'
import { BoardNotice } from '@/components/shell/board-notice'
import { PanelPage, PanelSection } from '@/components/shell/panel-page'
import { getContainer } from '@/server/container'
import { getActor } from '@/server/context'
import { getTranslator, tr } from '@/server/i18n'
import { issueWarningFormCopy, moderationFormsCopy } from '@/view/moderation-copy'
import { buildWarningView, warningNotice } from '@/view/warnings'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.warn-member') }
}

function positiveInt(value: string | undefined): number | null {
  if (value === undefined || !/^[1-9]\d*$/.test(value)) return null
  const n = Number(value)
  return Number.isSafeInteger(n) ? n : null
}

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

  const citedPost = positiveInt(query.post)
  const postId =
    citedPost !== null && (await warnings.findPostAuthor(citedPost)) === userId ? citedPost : null

  const translator = await getTranslator()

  const view = buildWarningView({
    member: { userId: member.id, username: member.username },
    standing,
    types,
    history: history.rows,
    ...(history.nextCursor === undefined ? {} : { nextCursor: history.nextCursor }),
    now: new Date(),
    t: translator,
  })

  const notice = warningNotice(query, translator)

  return (
    <PanelPage
      title={translator.t('board.warnings.title', { username: view.member.username })}
      back={{ href: view.member.href, label: view.member.username }}
      lede={translator.t('board.warnings.standing', {
        points: view.standing.points,
        threshold: view.standing.levelLabel ?? 'none',
        thresholdPoints: view.standing.levelPoints ?? 0,
      })}
    >
      {notice !== null && (
        <BoardNotice
          kind="info"
          message={notice}
          dismissHref={`/moderation/warn?user=${view.member.userId}`}
        />
      )}

      <IssueWarningForm
        copy={issueWarningFormCopy(view.member.username, translator)}
        userId={view.member.userId}
        postId={postId}
        types={view.types}
      />

      <PanelSection id="history-heading" title={await tr('page.history')}>
        {view.history.length === 0 ? (
          <Card>
            <Empty className="py-8">
              <EmptyTitle>{await tr('page.never-warned')}</EmptyTitle>
              <EmptyDescription>{await tr('page.this-member-has-no-warning')}</EmptyDescription>
            </Empty>
          </Card>
        ) : (
          <ul className="flex flex-col gap-3">
            {view.history.map((row) => (
              <li
                key={row.id}
                className="rounded-lg border border-border bg-card p-4 text-card-foreground shadow-elevation"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">
                    {translator.t('board.warnings.item', { title: row.title, count: row.points })}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {translator.t('board.warnings.by', { username: row.issuedBy })} ·{' '}
                    <time dateTime={row.issuedAt.iso}>{row.issuedAt.label}</time>
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm">{row.reason}</p>
                {row.postId !== null && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {translator.t('board.warnings.aboutPost', { id: row.postId })}
                  </p>
                )}
                {row.lapsed === null ? (
                  <div className="mt-3">
                    <RevokeWarningForm
                      warningId={row.id}
                      userId={view.member.userId}
                      copy={moderationFormsCopy(translator)}
                    />
                  </div>
                ) : (
                  <p className="mt-2 text-xs italic text-muted-foreground">{row.lapsed}</p>
                )}
              </li>
            ))}
          </ul>
        )}

        {view.nextHref !== null && (
          <TextLink href={view.nextHref} size="sm">
            {await tr('page.older-warnings')}
          </TextLink>
        )}
      </PanelSection>
    </PanelPage>
  )
}
