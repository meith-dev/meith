import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { ModeratorPanel } from '@meith/moderation'
import {
  Alert,
  AlertDescription,
  Card,
  CardContent,
  CardRows,
  Empty,
  EmptyDescription,
  EmptyTitle,
  Field,
  Input,
  buttonVariants,
} from '@meith/ui'

import { PanelPage, PanelSection } from '@/components/shell/panel-page'
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
    subjectId === null || warnings === null
      ? null
      : await warnings.findWarnable(subjectId)

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
    <PanelPage
      title="Address lookup"
      lede={
        <>
          Finds accounts that share a stored address <em>range</em> with a member. The
          board never stores a full address, so this is evidence to follow up, not proof.
          Every lookup is recorded in the moderator log.
        </>
      }
    >
      <Card>
        <CardContent>
          <form method="get" className="flex flex-wrap items-end gap-3">
            <Field name="user" label="Member id" className="w-40">
              {(control) => (
                <Input
                  {...control}
                  type="number"
                  min={1}
                  defaultValue={subjectId ?? ''}
                />
              )}
            </Field>
            <button type="submit" className={buttonVariants()}>
              Look up
            </button>
          </form>
        </CardContent>
      </Card>

      {subjectId !== null && subject === null && (
        <Alert tone="warning">
          <AlertDescription>No such member.</AlertDescription>
        </Alert>
      )}

      {subject !== null && result !== null && (
        <PanelSection
          id="matches-heading"
          title={
            <>
              Accounts sharing a range with{' '}
              <a
                href={memberHref(subject.id)}
                className="underline decoration-border underline-offset-2 hover:decoration-foreground"
              >
                {subject.username}
              </a>
            </>
          }
          description={
            <>
              Ranges on record: registration{' '}
              <code className="font-mono">{result.prefixes.registration ?? 'none'}</code>,
              last visit{' '}
              <code className="font-mono">{result.prefixes.lastVisit ?? 'none'}</code>.
            </>
          }
        >
          <Card>
            {result.matches.length === 0 ? (
              <Empty className="py-8">
                <EmptyTitle>No shared range</EmptyTitle>
                <EmptyDescription>
                  No other account shares a recorded range with this member.
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
              </CardRows>
            )}
          </Card>
        </PanelSection>
      )}
    </PanelPage>
  )
}
