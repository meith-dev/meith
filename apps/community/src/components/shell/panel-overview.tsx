import { buttonVariants, Card, CardContent, Empty, EmptyDescription, EmptyTitle } from '@meith/ui'

import type { PanelSectionCopy } from '@/view/panel-nav'

export interface WaitingItem {
  readonly count: number
  readonly one: string
  readonly many: string
  readonly href: string
  readonly action: string
}

function PanelWaiting({ item }: { item: WaitingItem }) {
  return (
    <Card className="flex-1 rounded-xl border-l-4 border-l-moderation-pending">
      <CardContent className="flex items-center justify-between gap-4 p-5">
        <div>
          <p className="text-3xl font-semibold tracking-tight tabular-nums text-foreground">
            {item.count}
          </p>
          <p className="text-sm text-muted-foreground">{item.count === 1 ? item.one : item.many}</p>
        </div>
        <a href={item.href} className={buttonVariants({ variant: 'primary', size: 'sm' })}>
          {item.action}
        </a>
      </CardContent>
    </Card>
  )
}

export function PanelWaitingList({
  items,
  emptyTitle,
  emptyDescription,
}: {
  readonly items: readonly WaitingItem[]
  readonly emptyTitle: string
  readonly emptyDescription: string
}) {
  const waiting = items.filter((item) => item.count > 0)

  if (waiting.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/60">
        <Empty className="py-8">
          <span
            aria-hidden="true"
            className="mb-1 flex size-9 items-center justify-center rounded-full bg-moderation-approved/10 text-moderation-approved"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 16 16"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m3.5 8.5 3 3 6-7" />
            </svg>
          </span>
          <EmptyTitle>{emptyTitle}</EmptyTitle>
          <EmptyDescription>{emptyDescription}</EmptyDescription>
        </Empty>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      {waiting.map((item) => (
        <PanelWaiting key={item.href} item={item} />
      ))}
    </div>
  )
}

export function PanelSectionGrid({ sections }: { sections: readonly PanelSectionCopy[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {sections.map((section) => (
        <li key={section.href}>
          <Card className="group relative h-full rounded-xl transition-[border-color,box-shadow] hover:border-primary/40 hover:shadow-lg">
            <CardContent className="flex h-full flex-col gap-1 p-4">
              <span className="flex items-center justify-between gap-2">
                <a
                  href={section.href}
                  className="text-sm font-semibold text-foreground underline-offset-2 group-hover:text-primary"
                >
                  <span className="absolute inset-0" />
                  {section.title}
                </a>
                <svg
                  aria-hidden="true"
                  viewBox="0 0 16 16"
                  className="size-4 shrink-0 text-muted-foreground/60 transition-[color,transform] group-hover:translate-x-0.5 group-hover:text-primary"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3.5 8h9M8.5 4l4 4-4 4" />
                </svg>
              </span>
              <p className="text-xs text-muted-foreground">{section.blurb}</p>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  )
}
