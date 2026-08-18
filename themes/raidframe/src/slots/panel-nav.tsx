import type { PanelNavItemModel, PanelNavModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

import { MICRO, NUMERIC, RULE } from '../shared'

const ITEM = 'flex items-baseline gap-2 border-l-2 px-2.5 py-1.5 text-[0.8125rem] tracking-[0.02em]'

const HERE = 'border-l-primary bg-secondary font-semibold text-foreground'
const OPEN = 'border-l-primary/40 font-semibold text-foreground'
const ELSEWHERE =
  'border-l-transparent text-muted-foreground hover:border-l-border hover:text-primary'

function Count({ count, copy }: { count: number; copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `raidframe.panelNav.${key}`)

  return (
    <>
      <span
        aria-hidden="true"
        className={`ml-auto border border-primary/50 bg-primary/15 px-1.5 text-[0.625rem] font-bold text-primary ${NUMERIC}`}
      >
        {count > 99 ? '99+' : count}
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
      <span className="min-w-0 flex-1">{item.title}</span>
      {item.count !== null && <Count count={item.count} copy={copy} />}
    </>
  )

  if (item.isRecord) {
    return (
      <span className={`${ITEM} ${HERE} ${className}`} aria-current="page">
        {body}
      </span>
    )
  }

  return (
    <a
      href={item.href}
      className={`${ITEM} ${className}`}
      {...(item.current === null
        ? {}
        : { 'aria-current': item.current === 'here' ? ('page' as const) : ('true' as const) })}
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
    <nav aria-label={label}>
      <ul className="flex flex-col">
        {sections.map((section) => (
          <li
            key={section.href}
            className={section.isOverview ? 'mb-1 border-b border-border pb-1' : undefined}
          >
            <Item
              item={section}
              className={section.current === 'here' ? HERE : section.isOpen ? OPEN : ELSEWHERE}
              copy={copy}
            />

            {section.isOpen && section.children.length > 0 && (
              <ul className="my-0.5 ml-3 flex flex-col border-l border-border pl-1">
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
      <details className="border border-border bg-card lg:hidden">
        <summary className="flex cursor-pointer items-center justify-between gap-2 bg-surface px-3 py-2">
          <span className={`${MICRO} text-foreground`}>{label}</span>
          {currentTitle !== null && <span className={MICRO}>{currentTitle}</span>}
        </summary>
        <div className={RULE} aria-hidden="true" />
        <div className="p-2">
          <Sections label={label} sections={sections} copy={copy} />
        </div>
      </details>

      <div className="hidden border border-border bg-card shadow-elevation lg:block">
        <p className={`${MICRO} border-b border-border bg-surface px-3 py-2 text-foreground`}>
          {label}
        </p>
        <div className={RULE} aria-hidden="true" />
        <div className="p-2">
          <Sections label={label} sections={sections} copy={copy} />
        </div>
      </div>
    </>
  )
}
