import type { DiscoveryViewModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'
import {
  Avatar,
  buttonVariants,
  Card,
  CardRows,
  cn,
  Empty,
  EmptyDescription,
  NavTabs,
  PageDescription,
  PageHeader,
  PageHeaderContent,
  PageTitle,
} from '@meith/ui'

import { LINK, NUMERIC, PILL, pageAt, Stamp } from '../shared'

export function DiscoveryView({
  title,
  blurb,
  tabsLabel,
  tabs,
  rows,
  nextHref,
  nextLabel,
  emptyMessage,
  refusal,
  copy,
}: DiscoveryViewModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `default.discoveryView.${key}`)

  return (
    <main
      id="board-content"
      tabIndex={-1}
      className={`${pageAt('max-w-4xl')} flex flex-1 flex-col gap-6 py-6 sm:py-8`}
    >
      <PageHeader>
        <PageHeaderContent>
          <PageTitle>{title}</PageTitle>
          <PageDescription>{blurb}</PageDescription>
        </PageHeaderContent>
      </PageHeader>

      <NavTabs label={tabsLabel} tabs={tabs} />

      {refusal !== null ? (
        <p role="alert" className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
          {refusal.message}{' '}
          <a href={refusal.signInHref} className={`font-medium text-foreground ${LINK}`}>
            {refusal.signInLabel}
          </a>
        </p>
      ) : rows.length === 0 ? (
        <Card className="rounded-xl">
          <Empty>
            <EmptyDescription>{emptyMessage}</EmptyDescription>
          </Empty>
        </Card>
      ) : (
        <Card className="rounded-xl">
          <CardRows>
            {rows.map((row) => (
              <li
                key={row.threadId}
                className="flex gap-3.5 px-4 py-3.5 transition-colors hover:bg-muted/50 sm:items-center sm:px-5"
              >
                <Avatar src={null} name={row.authorUsername} size={36} className="rounded-full" />

                <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <a
                      href={row.href}
                      className={`line-clamp-2 [overflow-wrap:anywhere] text-[0.9375rem] font-medium text-foreground ${LINK}`}
                    >
                      {row.title}
                    </a>
                    <p className="truncate text-xs text-muted-foreground">
                      {c('startedBy')} {row.authorUsername} {c('in')}{' '}
                      <a href={row.forum.href} className="font-medium hover:underline">
                        {row.forum.label}
                      </a>
                    </p>
                  </div>

                  <p className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground sm:flex-col sm:items-end sm:gap-0.5">
                    <span className={`${PILL} ${NUMERIC}`}>
                      {row.replyCount.label}{' '}
                      {row.replyCount.value === 1 ? c('reply.one') : c('reply.other')}
                    </span>
                    <span>
                      {c('lastPost')} <Stamp at={row.lastPostAt} />
                      {row.lastPostUsername === null ? null : ` ${c('by')} ${row.lastPostUsername}`}
                    </span>
                  </p>
                </div>
              </li>
            ))}
          </CardRows>
        </Card>
      )}

      {nextHref !== null && (
        <a
          href={nextHref}
          className={cn(buttonVariants({ variant: 'secondary' }), 'w-fit rounded-full')}
        >
          {nextLabel} {c('nextArrow')}
        </a>
      )}
    </main>
  )
}
