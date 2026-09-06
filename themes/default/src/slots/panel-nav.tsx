import type { PanelNavItemModel, PanelNavModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'
import { cn, NavigationDrawer } from '@meith/ui'

import { PanelIcon } from '../panel-icons'

const ITEM =
  'group/item relative flex items-center gap-3 rounded-lg px-3 py-2 pointer-coarse:min-h-11 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

const HERE = 'bg-primary/10 font-semibold text-primary [&_svg]:text-primary'
const OPEN = 'font-semibold text-foreground hover:bg-muted'
const ELSEWHERE = 'text-muted-foreground hover:bg-muted hover:text-foreground'

function Count({ count, copy }: { count: number; copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `default.panelNav.${key}`)

  return (
    <>
      <span
        aria-hidden="true"
        className="ml-auto min-w-5 rounded-full bg-primary px-1.5 py-0.5 text-center text-[0.6875rem] leading-4 font-semibold tabular-nums text-primary-foreground"
      >
        {count > 99 ? c('countCap') : count}
      </span>
      <span className="sr-only">
        ({count} {c('waiting')})
      </span>
    </>
  )
}

function ItemContent({ item, copy }: { item: PanelNavItemModel; copy: SlotCopy }) {
  return (
    <>
      {item.icon !== null && (
        <span className="text-muted-foreground/70 transition-colors group-hover/item:text-foreground">
          <PanelIcon icon={item.icon} />
        </span>
      )}
      <span className="min-w-0 flex-1 text-start [overflow-wrap:anywhere]">{item.title}</span>
      {item.count !== null && <Count count={item.count} copy={copy} />}
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
  const body = <ItemContent item={item} copy={copy} />

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
      <ul className="flex flex-col gap-0.5">
        {sections.map((section) => (
          <li
            key={section.href}
            className={cn(section.isOverview && 'mb-1.5 border-b border-border pb-1.5')}
          >
            <Item
              item={section}
              className={section.current === 'here' ? HERE : section.isOpen ? OPEN : ELSEWHERE}
              copy={copy}
            />

            {section.isOpen && section.children.length > 0 && (
              <ul className="my-1 ml-5 flex flex-col gap-0.5 border-l-2 border-border pl-2">
                {section.children.map((child) => (
                  <li key={child.href}>
                    <Item
                      item={child}
                      className={cn('py-1.5', child.current === 'here' ? HERE : ELSEWHERE)}
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

export function MobilePanelNav({
  panel,
  label,
  sections,
  copy,
}: PanelNavModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `default.panelNav.${key}`)

  return (
    <div className="lg:hidden">
      <NavigationDrawer
        showTrigger={false}
        id={`panel-${panel}-navigation`}
        title={c(`title.${panel}`)}
        openLabel={c('open')}
        closeLabel={c('close')}
      >
        <nav aria-label={label} className="text-sm">
          <ul className="flex flex-col gap-1">
            {sections.map((section) => (
              <li
                key={section.href}
                className={cn(section.isOverview && 'mb-2 border-b border-border pb-2')}
              >
                {section.children.length > 0 ? (
                  <details open={section.isOpen} className="group/section">
                    <summary
                      className={cn(
                        ITEM,
                        'min-h-11 cursor-pointer list-none [&::-webkit-details-marker]:hidden',
                        section.isOpen ? OPEN : ELSEWHERE,
                      )}
                    >
                      <ItemContent item={section} copy={copy} />
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 16 16"
                        className="size-4 shrink-0 transition-transform group-open/section:rotate-90"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="m6 4 4 4-4 4" />
                      </svg>
                    </summary>
                    <ul className="my-1 ms-5 flex flex-col gap-1 border-s-2 border-border ps-2">
                      <li>
                        <Item
                          item={{ ...section, title: c('overview'), icon: null, count: null }}
                          className={cn('min-h-11', section.current === 'here' ? HERE : ELSEWHERE)}
                          copy={copy}
                        />
                      </li>
                      {section.children.map((child) => (
                        <li key={child.href}>
                          <Item
                            item={child}
                            className={cn('min-h-11', child.current === 'here' ? HERE : ELSEWHERE)}
                            copy={copy}
                          />
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : (
                  <Item
                    item={section}
                    className={cn('min-h-11', section.current === 'here' ? HERE : ELSEWHERE)}
                    copy={copy}
                  />
                )}
              </li>
            ))}
          </ul>
        </nav>
      </NavigationDrawer>
    </div>
  )
}

export function PanelNav(props: PanelNavModel & { copy: SlotCopy }) {
  return (
    <>
      <MobilePanelNav {...props} />
      <div className="hidden rounded-xl border border-border bg-card p-2 shadow-elevation lg:block">
        <Sections label={props.label} sections={props.sections} copy={props.copy} />
      </div>
    </>
  )
}
