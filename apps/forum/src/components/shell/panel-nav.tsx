'use client'

import { usePathname } from 'next/navigation'

import { Disclosure, cn } from '@meith/ui'

import {
  type PanelNav,
  currentProps,
  deepestHrefIn,
  flattenNav,
  sectionHrefIn,
} from '@/view/panel-nav'

const ITEM =
  'block rounded-md px-3 py-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

const HERE = 'bg-muted font-medium text-foreground'
const ELSEWHERE = 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'

export interface PanelNavProps {
  readonly nav: PanelNav
  readonly overviewHref: string
  readonly fallbackHref?: string
}

function SectionList({
  nav,
  overviewHref,
  fallbackHref,
  pathname,
}: PanelNavProps & { pathname: string }) {
  const active = sectionHrefIn(nav, pathname) ?? fallbackHref ?? null
  const deepest = deepestHrefIn(nav, pathname) ?? fallbackHref ?? null

  return (
    <nav aria-label="Sections" className="text-sm">
      <ul className="flex flex-col gap-0.5">
        {nav.map((section) => {
          const children = active === section.href ? (section.children ?? []) : []

          return (
            <li
              key={section.href}
              className={cn(section.href === overviewHref && 'mb-1 border-b border-border pb-1')}
            >
              <a
                href={section.href}
                className={cn(
                  ITEM,
                  pathname === section.href
                    ? HERE
                    : active === section.href
                      ? 'font-medium text-foreground hover:bg-muted/60'
                      : ELSEWHERE,
                )}
                {...currentProps(pathname, section.href, deepest)}
              >
                {section.title}
              </a>

              {children.length > 0 && (
                <ul className="mt-0.5 ml-3 flex flex-col gap-0.5 border-l border-border pl-2">
                  {children.map((child) => (
                    <li key={child.href}>
                      <a
                        href={child.href}
                        className={cn(ITEM, pathname === child.href ? HERE : ELSEWHERE)}
                        {...currentProps(pathname, child.href, deepest)}
                      >
                        {child.title}
                      </a>
                    </li>
                  ))}
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

  const deepest = deepestHrefIn(props.nav, pathname) ?? props.fallbackHref ?? null
  const here = flattenNav(props.nav).find((item) => item.href === deepest)

  return (
    <>
      <Disclosure
        summary="Sections"
        className="lg:hidden"
        contentClassName="p-2"
        {...(here === undefined ? {} : { aside: here.title })}
      >
        <SectionList {...props} pathname={pathname} />
      </Disclosure>

      <div className="hidden lg:block">
        <SectionList {...props} pathname={pathname} />
      </div>
    </>
  )
}
