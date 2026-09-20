import type { DiscoveryViewModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'
import { NavTabs } from '@meith/ui'

import {
  Arrow,
  Counts,
  EDITORIAL_RULE,
  ITEM_TITLE,
  LEDE,
  META,
  PAGE_TITLE,
  QUIET_LINK,
  ROW_HOVER,
  RULE,
  SHELL,
  Stamp,
  TEXT_LINK,
} from '../shared'

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
  const c = (key: string) => fromSlotCopy(copy, `meith.discoveryView.${key}`)

  return (
    <main
      id="board-content"
      tabIndex={-1}
      className={`${SHELL} flex max-w-4xl flex-1 flex-col gap-8 py-8`}
    >
      <div className="flex flex-col gap-2">
        <h1 className={PAGE_TITLE}>{title}</h1>
        <p className={LEDE}>{blurb}</p>
      </div>

      <NavTabs label={tabsLabel} tabs={tabs} />

      {refusal !== null ? (
        <p
          role="alert"
          className={`${EDITORIAL_RULE} pt-4 text-[0.9375rem] leading-relaxed text-foreground`}
        >
          {refusal.message}{' '}
          <a href={refusal.signInHref} className={`font-medium text-foreground ${TEXT_LINK}`}>
            {refusal.signInLabel}
          </a>
        </p>
      ) : rows.length === 0 ? (
        <p className={`${EDITORIAL_RULE} pt-4 ${LEDE}`}>{emptyMessage}</p>
      ) : (
        <ul className={`${EDITORIAL_RULE} @container/card`}>
          {rows.map((row) => (
            <li
              key={row.threadId}
              className={`group grid gap-x-6 gap-y-2 py-4 ${RULE} first:border-t-0 ${ROW_HOVER} @3xl/card:grid-cols-[minmax(0,1fr)_7rem_15rem] @3xl/card:items-baseline`}
            >
              <div className="min-w-0 [overflow-wrap:anywhere]">
                <p className={ITEM_TITLE}>
                  <a href={row.href} className={QUIET_LINK}>
                    {row.title}
                  </a>
                </p>
                <p className={`${META} mt-0.5`}>
                  {c('startedBy')} {row.authorUsername} {c('in')}{' '}
                  <a href={row.forum.href} className={`font-medium text-foreground ${QUIET_LINK}`}>
                    {row.forum.label}
                  </a>
                </p>
              </div>

              <Counts
                items={[
                  {
                    label: c('reply.other'),
                    value: row.replyCount,
                    one: c('reply.one'),
                    many: c('reply.other'),
                  },
                ]}
              />

              <p
                className={`${META} min-w-0 @3xl/card:border-l @3xl/card:border-border @3xl/card:pl-5`}
              >
                {c('lastPost')} <Stamp at={row.lastPostAt} />
                {row.lastPostUsername === null ? null : ` ${c('by')} ${row.lastPostUsername}`}
              </p>
            </li>
          ))}
        </ul>
      )}

      {nextHref !== null && (
        <p>
          <a
            href={nextHref}
            className={`group text-[0.8125rem] font-medium text-foreground ${TEXT_LINK}`}
          >
            {nextLabel}
            <Arrow />
          </a>
        </p>
      )}
    </main>
  )
}
