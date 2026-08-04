import type { HeaderModel } from '@meith/theme-kit'

import { LINK, PAGE } from '../shared'

/**
 * The board header (F25/F27).
 *
 * `children` is the user panel, so a theme decides where in the header it sits
 * without the page knowing anything about this theme's layout.
 *
 * ## Two rows, and the second one scrolls
 *
 * The board's navigation is six items today — forums, two discovery views, the
 * member's own posts, search, who's online — and `HeaderModel.navigation` is a
 * list the app is free to grow. Wrapping six links onto three lines on a phone
 * pushes the first thread of the board below the fold; a hamburger costs a
 * client component in the layout of every page, which is the one place this
 * board will not spend bytes.
 *
 * So the nav is a single row that scrolls horizontally when it has to.
 * `overflow-x-auto` with no scrollbar styling: the platform draws its own, the
 * row is swipeable, and every item stays reachable by keyboard because it is
 * still an ordinary link in an ordinary list. `-mx-4 px-4` lets the first and
 * last item sit flush with the page's measure while the scroll area runs the
 * full width, so nothing looks clipped at rest.
 *
 * ## The two rows are also two landmarks
 *
 * `<header>` is the banner; the nav inside it is labelled, and the breadcrumb —
 * a separate slot — is labelled differently. Two `<nav>` elements with the same
 * accessible name are worse than one, because the rotor lists both and neither
 * says which is which.
 */
export function Header({ boardTitle, homeHref, navigation, children }: HeaderModel) {
  return (
    <header className="border-b border-border bg-card">
      <div className={`${PAGE} flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-3`}>
        <a
          href={homeHref}
          className={`font-serif text-xl font-semibold tracking-tight text-foreground ${LINK}`}
        >
          {boardTitle}
        </a>
        {children}
      </div>

      {navigation.length > 0 && (
        <nav aria-label="Board sections" className="border-t border-border">
          <ul className={`${PAGE} -mx-px flex items-stretch gap-1 overflow-x-auto text-sm`}>
            {navigation.map((item) => (
              <li key={item.href} className="shrink-0">
                <a
                  href={item.href}
                  className="inline-flex h-10 items-center rounded-t-md border-b-2 border-transparent px-2.5 font-medium text-muted-foreground transition-colors hover:border-border hover:text-foreground"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  )
}
