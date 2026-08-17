import type { Metadata } from 'next'

import { rangeChoice } from '@meith/analytics'
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Card,
  CardContent,
  CardFooter,
  CardRows,
  Empty,
  EmptyDescription,
  EmptyTitle,
  buttonVariants,
  cn,
} from '@meith/ui'

import { PanelPage, PanelSection } from '@/components/shell/panel-page'
import { adminPageContext } from '@/server/admin'
import { readAnalytics } from '@/server/analytics'
import { buildAnalyticsModel, dayLabel } from '@/view/admin-analytics'
import type { AnalyticsEntry } from '@/view/admin-analytics'

export const metadata: Metadata = { title: 'Analytics' }

const SETTINGS_HREF = '/admin/settings?group=analytics'

const CONNECTOR_NOTE: Record<string, string> = {
  off: 'The Google Analytics connector is off. Nothing leaves this board.',
  'missing-id':
    'The Google Analytics connector is on but has no measurement ID, so nothing is sent.',
  'invalid-id':
    'The Google Analytics connector is on but its measurement ID is not a GA4 one, so nothing is sent.',
  'missing-secret':
    'The Google Analytics connector is on but has no API secret, so nothing is sent.',
  ready: 'Every page view counted here is also sent to Google Analytics from the server.',
}

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>
}) {
  if ((await adminPageContext()) === null) return null

  const range = rangeChoice((await searchParams).days)
  const reading = await readAnalytics(range)

  if (reading === null) {
    return (
      <PanelPage title="Analytics" lede="This board counts nothing it cannot store.">
        <Card>
          <Empty className="py-10">
            <EmptyTitle>No database</EmptyTitle>
            <EmptyDescription>
              Page counts are kept in Postgres, and this board is running from the
              in-memory fixture.
            </EmptyDescription>
          </Empty>
        </Card>
      </PanelPage>
    )
  }

  const model = buildAnalyticsModel({
    summary: reading.summary,
    range,
    connector: reading.state.connector,
  })

  return (
    <PanelPage
      title="Analytics"
      width="wide"
      gap="loose"
      lede={
        <>
          Counted by this board as it renders each page — no script reaches your members,
          and no address, user agent or fingerprint is stored. A reader is separated from
          the next by a hash that changes every day, so nobody can be followed from one
          day to the next. Counts are kept for {reading.state.retentionDays} days.
        </>
      }
      actions={
        <div className="flex flex-wrap gap-2">
          {model.ranges.map((choice) => (
            <a
              key={choice.days}
              href={choice.href}
              aria-current={choice.current ? 'page' : undefined}
              className={buttonVariants({
                variant: choice.current ? 'secondary' : 'outline',
                size: 'sm',
              })}
            >
              {choice.label}
            </a>
          ))}
        </div>
      }
    >
      {!reading.state.counting && (
        <Alert tone="warning">
          <AlertDescription>
            <AlertTitle>Counting is off.</AlertTitle> This board is recording nothing, so
            the figures below are whatever it counted while it was on. Switch “Count page
            views” on to start.
          </AlertDescription>
          <a
            href={SETTINGS_HREF}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'shrink-0')}
          >
            Settings
          </a>
        </Alert>
      )}

      <PanelSection id="totals-heading" title={`The last ${range} days`}>
        <Card>
          <CardContent className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
            {[
              { label: 'Page views', value: model.totals.views },
              { label: 'Visitors', value: model.totals.visitors },
              { label: 'Views a day', value: model.viewsPerDay },
              { label: 'Signed-in views', value: model.totals.memberViews },
            ].map((figure) => (
              <div key={figure.label}>
                <p className="text-2xl font-semibold tabular-nums text-foreground">
                  {figure.value.toLocaleString('en')}
                </p>
                <p className="text-xs text-muted-foreground">{figure.label}</p>
              </div>
            ))}
          </CardContent>
          <CardFooter className="justify-between">
            <span>
              {model.totals.visitors === 0
                ? 'No visitors counted in this range'
                : `${model.totals.memberVisitors.toLocaleString('en')} signed in, ${model.totals.guestVisitors.toLocaleString('en')} not`}
            </span>
            <span>
              {model.recordedFrom === null
                ? 'Nothing recorded yet'
                : `Counting since ${dayLabel(model.recordedFrom)}`}
            </span>
          </CardFooter>
        </Card>
      </PanelSection>

      <PanelSection id="days-heading" title="By day">
        <Card>
          {!model.hasCounts ? (
            <Empty className="py-10">
              <EmptyTitle>Nothing counted in this range</EmptyTitle>
              <EmptyDescription>
                {reading.state.counting
                  ? 'Page views appear here as they are rendered.'
                  : 'Counting is off, so no page view has been recorded.'}
              </EmptyDescription>
            </Empty>
          ) : (
            <>
              <CardContent className="p-5">
                <ol className="flex h-40 items-end gap-1" aria-label="Page views by day">
                  {model.bars.map((bar) => (
                    <li
                      key={bar.day}
                      className="flex h-full flex-1 items-end"
                      title={`${bar.label}: ${bar.views} views, ${bar.visitors} visitors`}
                    >
                      <div
                        className="w-full rounded-t bg-primary/70"
                        style={{ height: `${bar.height}%` }}
                      >
                        <span className="sr-only">
                          {bar.label}: {bar.views} views, {bar.visitors} visitors
                        </span>
                      </div>
                    </li>
                  ))}
                </ol>
              </CardContent>
              <CardFooter className="justify-between">
                <span>{model.bars[0]?.label}</span>
                <span>
                  {model.totals.busiestDay === null
                    ? null
                    : `Busiest: ${dayLabel(model.totals.busiestDay.day)}, ${model.totals.busiestDay.views.toLocaleString('en')} views`}
                </span>
                <span>{model.bars[model.bars.length - 1]?.label}</span>
              </CardFooter>
            </>
          )}
        </Card>
      </PanelSection>

      <PanelSection id="pages-heading" title="Most read">
        <EntryCard
          entries={model.pages}
          emptyTitle="No pages counted"
          emptyDescription="Threads and profiles are counted together rather than one row each, so this list stays about the shape of the board. The most-viewed threads are on the board’s own statistics page."
          footer="Threads and member profiles are each counted as one line, whichever thread or member it was."
        />
      </PanelSection>

      <PanelSection id="sources-heading" title="Where visitors came from">
        <EntryCard
          entries={model.sources}
          emptyTitle="No outside links counted"
          emptyDescription="A visit that arrives with no referrer, or from a link on this board, is counted below rather than here."
          footer={`${model.directViews.toLocaleString('en')} arrived with no referrer, ${model.internalViews.toLocaleString('en')} from a link on this board.`}
        />
      </PanelSection>

      <PanelSection id="connector-heading" title="Google Analytics">
        <Card>
          <CardContent className="flex flex-col gap-2 p-5 text-sm">
            <p>{CONNECTOR_NOTE[reading.state.connector]}</p>
            {reading.state.connector === 'ready' && !reading.state.knowsOwnAddress && (
              <p>
                Nothing is being sent, though: the connector sends an absolute page
                address and this board does not know its own. Set “Board address” under{' '}
                <a
                  href="/admin/settings?group=board"
                  className="underline underline-offset-2"
                >
                  board settings
                </a>
                , or <code>APP_URL</code> in the environment.
              </p>
            )}
          </CardContent>
          <CardFooter>
            <a
              href={SETTINGS_HREF}
              className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
            >
              The analytics settings
            </a>
          </CardFooter>
        </Card>
      </PanelSection>
    </PanelPage>
  )
}

function EntryCard({
  entries,
  emptyTitle,
  emptyDescription,
  footer,
}: {
  readonly entries: readonly AnalyticsEntry[]
  readonly emptyTitle: string
  readonly emptyDescription: string
  readonly footer: string
}) {
  return (
    <Card>
      {entries.length === 0 ? (
        <Empty className="py-8">
          <EmptyTitle>{emptyTitle}</EmptyTitle>
          <EmptyDescription>{emptyDescription}</EmptyDescription>
        </Empty>
      ) : (
        <CardRows>
          {entries.map((entry) => (
            <li
              key={entry.key}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-2.5 text-sm"
            >
              <span className="min-w-0 truncate text-foreground">{entry.label}</span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {entry.views.toLocaleString('en')} views · {entry.share}%
              </span>
            </li>
          ))}
        </CardRows>
      )}
      <CardFooter>{footer}</CardFooter>
    </Card>
  )
}
