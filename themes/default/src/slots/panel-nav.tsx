import type { PanelNavItemModel, PanelNavModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'
import { cn, Disclosure } from '@meith/ui'

import { PanelIcon } from '../panel-icons'

const ITEM =
  'relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

const HERE =
  'bg-secondary font-semibold text-foreground before:absolute before:top-1.5 before:bottom-1.5 before:-left-2.5 before:w-0.5 before:rounded-full before:bg-primary'
const OPEN = 'font-semibold text-foreground hover:bg-accent'
const ELSEWHERE = 'text-muted-foreground hover:bg-accent hover:text-foreground'

function Count({ count, copy }: { count: number; copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `default.panelNav.${key}`)

  return (
    <>
      <span
        aria-hidden="true"
        className="ml-auto min-w-5 rounded-full bg-primary px-1.5 py-0.5 text-center text-xs font-semibold tabular-nums text-primary-foreground"
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
      {item.icon !== null && (
        <span className="text-muted-foreground/80">
          <PanelIcon icon={item.icon} />
        </span>
      )}
      <span className="min-w-0 flex-1 truncate">{item.title}</span>
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

function Sections({
  label,
  sections,
  copy,
}: Pick<PanelNavModel, 'label' | 'sections'> & { copy: SlotCopy }) {
  return (
    <nav aria-label={label} className="text-sm">
      <ul className="flex flex-col gap-0.5 pl-2.5">
        {sections.map((section) => (
          <li
            key={section.href}
            className={cn(section.isOverview && 'mb-1 border-b border-border pb-1')}
          >
            <Item
              item={section}
              className={section.current === 'here' ? HERE : section.isOpen ? OPEN : ELSEWHERE}
              copy={copy}
            />

            {section.isOpen && section.children.length > 0 && (
              <ul className="mt-0.5 ml-4 flex flex-col gap-0.5 border-l border-border pl-2.5">
                {section.children.map((child) => (
                  <li key={child.href}>
                    <Item
                      item={child}
                      className={child.current === 'here' ? HERE : ELSEWHERE}
                      copy={copy}
                    />
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </nav>
  )
}

export function PanelNav({
  label,
  sections,
  currentTitle,
  copy,
}: PanelNavModel & { copy: SlotCopy }) {
  return (
    <>
      <div className="sticky top-0 z-20 -mx-4 bg-background/95 px-4 py-2 backdrop-blur-sm sm:-mx-6 sm:px-6 lg:hidden">
        <Disclosure
          summary={label}
          contentClassName="p-2"
          {...(currentTitle === null ? {} : { aside: currentTitle })}
        >
          <Sections label={label} sections={sections} copy={copy} />
        </Disclosure>
      </div>

      <div className="hidden rounded-lg border border-border bg-card p-2 shadow-elevation lg:block">
        <Sections label={label} sections={sections} copy={copy} />
      </div>
    </>
  )
}
