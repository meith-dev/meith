import type { NavigationModel } from '@meith/theme-kit'

import { MUTED_LINK, PAGE } from '../shared'

/**
 * The breadcrumb trail (F27).
 *
 * `<nav aria-label>` plus an ordered list, because a breadcrumb is a sequence and
 * screen readers announce it as one. The final item is the current page: it is
 * marked `aria-current` and is not a link, since linking a page to itself is a
 * dead control that keyboard users still have to tab through.
 *
 * ## The trail scrolls rather than wrapping
 *
 * A thread four forums deep has a crumb ending in a thread title somebody wrote,
 * and thread titles are unbounded. Wrapped, that trail is three lines of small
 * grey text above every post on the page. Scrolled, it is one line, and the crumb
 * a reader wants — the forum they came from — is at the left where they left it.
 *
 * The separator is a `<span aria-hidden>` rather than a CSS `::before`, because
 * generated content is announced by some screen readers and not others, and
 * "greater-than sign" between every crumb is the version nobody wants.
 */
export function Navigation({ items }: NavigationModel) {
  if (items.length === 0) return null

  return (
    <nav aria-label="Breadcrumb" className="border-b border-border bg-card/40">
      <ol
        className={`${PAGE} flex items-center gap-1.5 overflow-x-auto py-2 text-xs whitespace-nowrap text-muted-foreground`}
      >
        {items.map((item, index) => {
          const isLast = index === items.length - 1
          return (
            <li key={item.href} className="flex shrink-0 items-center gap-1.5">
              {index > 0 && (
                <span aria-hidden="true" className="text-border select-none">
                  /
                </span>
              )}
              {isLast ? (
                /*
                 * The one crumb allowed to be long: it names the page you are
                 * on, so it truncates rather than pushing everything before it
                 * off the left edge of the scroll area.
                 */
                <span
                  aria-current="page"
                  className="max-w-[24ch] truncate font-medium text-foreground sm:max-w-none"
                >
                  {item.label}
                </span>
              ) : (
                <a href={item.href} className={MUTED_LINK}>
                  {item.label}
                </a>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
