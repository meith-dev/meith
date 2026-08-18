import type { PanelNavItemModel, PanelNavModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'
import { cn, Disclosure } from '@meith/ui'

import { Chip } from '../shared'

const ITEM =
  'flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold transition-colors duration-100'

const HERE = 'bg-primary/12 text-primary'
const OPEN = 'text-foreground hover:bg-accent'
const ELSEWHERE = 'text-muted-foreground hover:bg-accent hover:text-foreground'

function Item({
  item,
  className,
  copy,
}: {
  item: PanelNavItemModel
  className: string
  copy: SlotCopy
}) {
  const c = (key: string) => fromSlotCopy(copy, `phasebook.panelNav.${key}`)

  const body = (
    <>
      <span className="min-w-0 flex-1 truncate">{item.title}</span>
      {item.count !== null && (
        <Chip className="bg-primary/12 text-primary">
          {item.count > 99 ? '99+' : item.count}
          <span className="sr-only"> {c('waiting')}</span>
        </Chip>
      )}
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
            className={cn(section.isOverview && 'mb-1 border-b border-border pb-1')}
          >
            <Item
              item={section}
              className={section.current === 'here' ? HERE : section.isOpen ? OPEN : ELSEWHERE}
              copy={copy}
            />

            {section.isOpen && section.children.length > 0 && (
              <ul className="mt-1 ml-4 flex flex-col border-l border-border pl-2">
                {section.children.map((child) => (
                  <li key={child.href}>
                    <Item
                      item={child}
                      className={cn(
                        'text-[0.8125rem]',
                        child.current === 'here' ? HERE : ELSEWHERE,
                      )}
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
      <Disclosure
        summary={label}
        className="lg:hidden"
        contentClassName="p-2"
        {...(currentTitle === null ? {} : { aside: currentTitle })}
      >
        <Sections label={label} sections={sections} copy={copy} />
      </Disclosure>

      <div className="hidden rounded-lg border border-border bg-card p-2 shadow-elevation lg:block">
        <Sections label={label} sections={sections} copy={copy} />
      </div>
    </>
  )
}
