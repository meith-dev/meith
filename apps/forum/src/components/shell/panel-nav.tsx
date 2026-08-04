'use client'

/**
 * A control panel's section navigation — the rail, and the `<details>` that
 * replaces it on a phone.
 *
 * ## Why this is a client component
 *
 * Because a layout is not told what it is wrapping. The App Router gives a
 * layout its `params` and nothing else — there is no pathname on the server —
 * and the alternatives were to add a middleware whose only job is to copy the
 * URL into a header, or to make every page announce itself to a shell that
 * could work it out. `usePathname` is the boring answer.
 *
 * **It is not a JavaScript dependency.** The hook has a value during the
 * server render, so `aria-current` and the highlight are in the HTML that
 * arrives, and every item is a plain `<a href>`. With scripting off this is a
 * list of links that knows where you are; with scripting on it is the same
 * list. Nothing here enables anything (R5).
 *
 * ## What it renders
 *
 * One list, twice: a rail beside the content from `lg` up, and a `<details>`
 * above it below that. Only one of the two is displayed at any width, so only
 * one is in the accessibility tree — `display: none` is not a visual trick, it
 * removes the element from the tree entirely, which is what makes two
 * `<nav>`s with the same label honest rather than a duplicate landmark.
 *
 * The rail is sticky. A settings screen is thousands of pixels long and the
 * panel's other sections should not be a scroll away from it.
 *
 * ## Both panels use it, and that is the point
 *
 * The ACP had this first; the member's control panel is the second caller.
 * They differ in their tree and in one detail — whether an unrecognised
 * address falls back to the overview — and in nothing else, because two
 * control panels that navigate differently are two things to learn.
 *
 * The callers are themselves client modules (`AdminNav`, `UserCpNav`) that
 * import their own tree. That keeps the tree in the browser bundle rather than
 * serialised into the RSC payload as a prop on every page of the panel.
 */

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

/** The item you are on: filled, so it reads as a position and not as a link. */
const HERE = 'bg-muted font-medium text-foreground'
const ELSEWHERE = 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'

export interface PanelNavProps {
  readonly nav: PanelNav
  /**
   * The panel's front door, separated from the sections below it by a rule.
   * It is expected to be `nav[0]`; passing its href rather than deriving one
   * keeps this component from having an opinion about what a tree's first
   * entry means.
   */
  readonly overviewHref: string
  /**
   * Where an address inside the panel's routes but outside its tree should
   * land. The ACP passes `/admin`, which is a prefix of everything it owns;
   * the member's panel passes nothing, because its sections are scattered
   * across four route trees and there is no such prefix.
   */
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
              /* The overview is the way back, not one of the sections. */
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

  /*
   * The deepest match, so the collapsed row on a phone says "Mass mail" rather
   * than "Users" — it is the only thing on that screen that says where you are
   * within the panel, and the heading underneath already says the rest.
   */
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
