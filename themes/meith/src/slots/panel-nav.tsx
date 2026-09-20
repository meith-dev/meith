import { MobilePanelNav } from '@meith/theme-default'
import type { PanelNavItemModel, PanelNavModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'
import { cn } from '@meith/ui'

import { EDITORIAL_RULE, NUMERIC, TOUCH } from '../shared'

const ITEM = `flex items-center gap-3 border-l-2 py-1.5 pl-3 text-[0.8125rem] transition-colors duration-[160ms] ${TOUCH}`

const HERE = 'border-l-primary font-medium text-foreground'
const OPEN = 'border-l-transparent font-medium text-foreground'
const ELSEWHERE = 'border-l-transparent text-muted-foreground hover:text-foreground'

function Count({ count, copy }: { count: number; copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `meith.panelNav.${key}`)

  return (
    <>
      <span
        aria-hidden="true"
        className={`ms-auto font-mono text-[0.6875rem] text-foreground ${NUMERIC}`}
      >
        {count > 99 ? c('countCap') : count}
      </span>
      <span className="sr-only">
        ({count} {c('waiting')})
      </span>
    </>
  )
}

function Item({
  item,
  className,
  copy,
}: {
  item: PanelNavItemModel
  className: string
  copy: SlotCopy
}) {
  const body = (
    <>
      <span className="min-w-0 flex-1 text-start [overflow-wrap:anywhere]">{item.title}</span>
      {item.count !== null && <Count count={item.count} copy={copy} />}
    </>
  )

  if (item.isRecord) {
    return (
      <span className={cn(ITEM, HERE, className)} aria-current="page">
        {body}
      </span>
    )
  }

  return (
    <a
      href={item.href}
      className={cn(ITEM, className)}
      {...(item.current === null
        ? {}
        : {
            'aria-current': item.current === 'here' ? ('page' as const) : ('true' as const),
          })}
    >
      {body}
    </a>
  )
}

export function PanelNav(props: PanelNavModel & { copy: SlotCopy }) {
  return (
    <>
      <MobilePanelNav {...props} />
      <nav aria-label={props.label} className={`${EDITORIAL_RULE} hidden pt-3 lg:block`}>
        <ul className="flex flex-col">
          {props.sections.map((section) => (
            <li
              key={section.href}
              className={cn(section.isOverview && 'mb-2 border-b border-border pb-2')}
            >
              <Item
                item={section}
                className={section.current === 'here' ? HERE : section.isOpen ? OPEN : ELSEWHERE}
                copy={props.copy}
              />

              {section.isOpen && section.children.length > 0 && (
                <ul className="my-1 ml-3 flex flex-col">
                  {section.children.map((child) => (
                    <li key={child.href}>
                      <Item
                        item={child}
                        className={child.current === 'here' ? HERE : ELSEWHERE}
                        copy={props.copy}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </>
  )
}
