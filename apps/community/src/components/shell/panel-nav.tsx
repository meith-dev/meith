'use client'

import { usePathname, useSearchParams } from 'next/navigation'

import { Disclosure, cn } from '@meith/ui'

import {
  type PanelCounts,
  type PanelNav,
  countFor,
  currentProps,
  deepestHrefIn,
  flattenNav,
  isHere,
  sectionHrefIn,
  visibleChildren,
} from '@/view/panel-nav'

const ITEM =
  'flex items-baseline gap-2 rounded-lg px-3 py-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

const HERE = 'bg-secondary font-semibold text-foreground'
const ELSEWHERE = 'text-muted-foreground hover:bg-accent hover:text-foreground'

export interface PanelNavProps {
  readonly nav: PanelNav
  readonly overviewHref: string
  readonly fallbackHref?: string
  readonly counts?: PanelCounts
}

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

function SectionList({
  nav,
  overviewHref,
  fallbackHref,
  counts,
  location,
}: PanelNavProps & { location: string }) {
  const active = sectionHrefIn(nav, location) ?? fallbackHref ?? null
  const deepest = deepestHrefIn(nav, location) ?? fallbackHref ?? null

  return (
    <nav aria-label="Sections" className="text-sm">
      <ul className="flex flex-col gap-0.5">
        {nav.map((section) => {
          const children =
            active === section.href ? visibleChildren(section, deepest) : []
          const count = countFor(counts, section.href)

          return (
            <li
              key={section.href}
              className={cn(
                section.href === overviewHref && 'mb-1 border-b border-border pb-1',
              )}
            >
              <a
                href={section.href}
                className={cn(
                  ITEM,
                  isHere(location, section.href) && deepest === section.href
                    ? HERE
                    : active === section.href
                      ? 'font-semibold text-foreground hover:bg-accent'
                      : ELSEWHERE,
                )}
                {...currentProps(location, section.href, deepest)}
              >
                <span className="min-w-0 flex-1">{section.title}</span>
                {count !== null && <Count count={count} />}
              </a>

              {children.length > 0 && (
                <ul className="mt-0.5 ml-3 flex flex-col gap-0.5 border-l border-border pl-2">
                  {children.map((child) => {
                    const childCount = countFor(counts, child.href)

                    if (child.record === true) {
                      return (
                        <li key={child.href}>
                          <span className={cn(ITEM, HERE)} aria-current="page">
                            <span className="min-w-0 flex-1">{child.title}</span>
                          </span>
                        </li>
                      )
                    }

                    return (
                      <li key={child.href}>
                        <a
                          href={child.href}
                          className={cn(
                            ITEM,
                            isHere(location, child.href) ? HERE : ELSEWHERE,
                          )}
                          {...currentProps(location, child.href, deepest)}
                        >
                          <span className="min-w-0 flex-1">{child.title}</span>
                          {childCount !== null && <Count count={childCount} />}
                        </a>
                      </li>
                    )
                  })}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

export function PanelNav(props: PanelNavProps) {
  const pathname = usePathname()
  const search = useSearchParams().toString()
  const location = search === '' ? pathname : `${pathname}?${search}`

  const deepest = deepestHrefIn(props.nav, location) ?? props.fallbackHref ?? null
  const here = flattenNav(props.nav).find((item) => item.href === deepest)

  return (
    <>
      <Disclosure
        summary="Sections"
        className="lg:hidden"
        contentClassName="p-2"
        {...(here === undefined ? {} : { aside: here.title })}
      >
        <SectionList {...props} location={location} />
      </Disclosure>

      <div className="hidden rounded-lg border border-border bg-card p-2 shadow-elevation lg:block">
        <SectionList {...props} location={location} />
      </div>
    </>
  )
}
