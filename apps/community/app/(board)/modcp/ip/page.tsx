import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { ModeratorPanel } from '@meith/moderation'
import {
  Alert,
  AlertDescription,
  buttonVariants,
  Card,
  CardContent,
  CardRows,
  Empty,
  EmptyDescription,
  EmptyTitle,
  Field,
  Input,
} from '@meith/ui'

import { PanelPage, PanelSection } from '@/components/shell/panel-page'
import { getContainer } from '@/server/container'
import { getTranslator, tr } from '@/server/i18n'
import { resolveModCpAccess } from '@/server/modcp'
import { memberHref } from '@/view/member-profile'
import { formatTime } from '@/view/time'

export async function generateMetadata(): Promise<Metadata> {
  return { title: await tr('page.address-lookup') }
}

function positiveInt(value: string | undefined): number | null {
  if (value === undefined || !/^[1-9]\d*$/.test(value)) return null
  const n = Number(value)
  return Number.isSafeInteger(n) ? n : null
}

const MATCH_LABEL_KEYS: Readonly<Record<string, string>> = {
  registration: 'board.ip.registration',
  last_visit: 'board.ip.lastVisit',
  both: 'board.ip.both',
}

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
  const translator = await getTranslator()

  return (
    <PanelPage title={await tr('page.address-lookup')} lede={translator.t('board.ip.hint')}>
      <Card>
        <CardContent>
          <form method="get" className="flex flex-wrap items-end gap-3">
            <Field name="user" label={translator.t('board.ip.memberId')} className="w-40">
              {(control) => (
                <Input {...control} type="number" min={1} defaultValue={subjectId ?? ''} />
              )}
            </Field>
            <button type="submit" className={buttonVariants()}>
              {await tr('page.look-up')}
            </button>
          </form>
        </CardContent>
      </Card>

      {subjectId !== null && subject === null && (
        <Alert tone="warning">
          <AlertDescription>{await tr('page.no-such-member')}</AlertDescription>
        </Alert>
      )}

      {subject !== null && result !== null && (
        <PanelSection
          id="matches-heading"
          title={translator.t('board.ip.matches', { username: subject.username })}
          description={
            <>
              <a
                href={memberHref(subject.id)}
                className="underline decoration-border underline-offset-2 hover:decoration-foreground"
              >
                {subject.username}
              </a>
              . {translator.t('board.ip.ranges')} {translator.t('board.ip.registration')}{' '}
              <code className="font-mono">
                {result.prefixes.registration ?? translator.t('board.ip.none')}
              </code>
              ,{translator.t('board.ip.lastVisit')}{' '}
              <code className="font-mono">
                {result.prefixes.lastVisit ?? translator.t('board.ip.none')}
              </code>
              .
            </>
          }
        >
          <Card>
            {result.matches.length === 0 ? (
              <Empty className="py-8">
                <EmptyTitle>{await tr('page.no-shared-range')}</EmptyTitle>
                <EmptyDescription>
                  {await tr('page.no-other-account-shares-recorded')}
                </EmptyDescription>
              </Empty>
            ) : (
              <CardRows>
                {result.matches.map((match) => (
                  <li
                    key={match.userId}
                    className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm"
                  >
                    <a
                      href={memberHref(match.userId)}
                      className="font-medium text-foreground underline-offset-2 hover:underline"
                    >
                      {match.username}
                    </a>
                    <span className="text-xs text-muted-foreground">
                      {translator.t(MATCH_LABEL_KEYS[match.matchedOn] ?? 'board.ip.unknown')}
                      {match.lastActiveAt !== null && (
                        <>
                          {' '}
                          · {translator.t('board.ip.lastSeen')}{' '}
                          <time dateTime={formatTime(match.lastActiveAt, now, translator).iso}>
                            {formatTime(match.lastActiveAt, now, translator).label}
                          </time>
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </CardRows>
            )}
          </Card>
        </PanelSection>
      )}
    </PanelPage>
  )
}
