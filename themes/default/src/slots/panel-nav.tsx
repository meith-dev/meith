import { Disclosure, cn } from '@meith/ui'
import type { PanelNavItemModel, PanelNavModel } from '@meith/theme-kit'

const ITEM =
  'flex items-baseline gap-2 rounded-lg px-3 py-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

const HERE = 'bg-secondary font-semibold text-foreground'
const OPEN = 'font-semibold text-foreground hover:bg-accent'
const ELSEWHERE = 'text-muted-foreground hover:bg-accent hover:text-foreground'

function Count({ count }: { count: number }) {
  return (
    <>
      <span
        aria-hidden="true"
        className="ml-auto rounded-full bg-surface px-2 py-0.5 text-xs font-semibold tabular-nums text-foreground"
      >
        {count > 99 ? '99+' : count}
      </span>
      <span className="sr-only">({count} waiting)</span>
    </>
  )
}

function Item({ item, className }: { item: PanelNavItemModel; className: string }) {
  const body = (
    <>
      <span className="min-w-0 flex-1">{item.title}</span>
      {item.count !== null && <Count count={item.count} />}
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

function Sections({ label, sections }: Pick<PanelNavModel, 'label' | 'sections'>) {
  return (
    <nav aria-label={label} className="text-sm">
      <ul className="flex flex-col gap-0.5">
        {sections.map((section) => (
          <li
            key={section.href}
            className={cn(section.isOverview && 'mb-1 border-b border-border pb-1')}
          >
            <Item
              item={section}
              className={
                section.current === 'here' ? HERE : section.isOpen ? OPEN : ELSEWHERE
              }
            />

            {section.isOpen && section.children.length > 0 && (
              <ul className="mt-0.5 ml-3 flex flex-col gap-0.5 border-l border-border pl-2">
                {section.children.map((child) => (
                  <li key={child.href}>
                    <Item
                      item={child}
                      className={child.current === 'here' ? HERE : ELSEWHERE}
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

export function PanelNav({ label, sections, currentTitle }: PanelNavModel) {
  return (
    <>
      <Disclosure
        summary={label}
        className="lg:hidden"
        contentClassName="p-2"
        {...(currentTitle === null ? {} : { aside: currentTitle })}
      >
        <Sections label={label} sections={sections} />
      </Disclosure>

      <div className="hidden rounded-lg border border-border bg-card p-2 shadow-elevation lg:block">
        <Sections label={label} sections={sections} />
      </div>
    </>
  )
}
