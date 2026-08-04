'use client'

/**
 * The control panel's section navigation.
 *
 * ## Why this is a client component
 *
 * Because a layout is not told what it is wrapping. The App Router gives a
 * layout its `params` and nothing else — there is no pathname on the server —
 * and the alternatives were to add a middleware whose only job is to copy the
 * URL into a header, or to make all twenty-five pages announce themselves to a
 * shell that could work it out. `usePathname` is the boring answer.
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
 * The rail is sticky. The settings screen is thousands of pixels long and the
 * panel's other ten sections should not be a scroll away from it.
 *
 * ## Sub-pages appear under the section you are in
 *
 * See `@/view/admin-nav` for why the tree is shaped that way, and for the
 * longest-prefix matching that decides what is lit.
 */

import { usePathname } from 'next/navigation'

import { Disclosure, cn } from '@meith/ui'

import {
  ADMIN_NAV,
  ADMIN_OVERVIEW,
  activeSectionHref,
  currentProps,
  deepestNavHref,
} from '@/view/admin-nav'

const ITEM =
  'block rounded-md px-3 py-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

/** The item you are on: filled, so it reads as a position and not as a link. */
const HERE = 'bg-muted font-medium text-foreground'
const ELSEWHERE = 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'

function SectionList({ pathname }: { pathname: string }) {
  const active = activeSectionHref(pathname)
  const deepest = deepestNavHref(pathname)

  return (
    <nav aria-label="Sections" className="text-sm">
      <ul className="flex flex-col gap-0.5">
        {ADMIN_NAV.map((section) => {
          const children = active === section.href ? (section.children ?? []) : []

          return (
            <li
              key={section.href}
              /* The overview is the way back, not one of the sections. */
              className={cn(
                section.href === ADMIN_OVERVIEW.href && 'mb-1 border-b border-border pb-1',
              )}
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

export function AdminNav() {
  const pathname = usePathname()

  /*
   * The deepest match, so the collapsed row on a phone says "Mass mail" rather
   * than "Users" — it is the only thing on that screen that says where you are
   * within the panel, and the heading underneath already says the rest.
   */
  const deepest = deepestNavHref(pathname)
  const here =
    ADMIN_NAV.flatMap((section) => [section, ...(section.children ?? [])]).find(
      (item) => item.href === deepest,
    ) ?? ADMIN_OVERVIEW

  return (
    <>
      <Disclosure
        summary="Sections"
        aside={here.title}
        className="lg:hidden"
        contentClassName="p-2"
      >
        <SectionList pathname={pathname} />
      </Disclosure>

      <div className="hidden lg:block">
        <SectionList pathname={pathname} />
      </div>
    </>
  )
}
