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
 * The board's navigation is six items today — communities, two discovery views, the
 * member's own posts, search, who's online — and `HeaderModel.navigation` is a
 * list the app is free to grow. Wrapping six links onto three lines on a phone
 * pushes the first thread of the board below the fold; a hamburger costs a
 * client component in the layout of every page, which is the one place this
 * board will not spend bytes.
 *
 * So the nav is a single row that scrolls horizontally when it has to.
 * `overflow-x-auto` with no scrollbar styling: the platform draws its own, the
 * row is swipeable, and every item stays reachable by keyboard because it is
 * still an ordinary link in an ordinary list.
 *
 * **The scroll area is the page, not the measure.** This paragraph described
 * `-mx-4 px-4` for two features and the markup carried `-mx-px`, which is a
 * different thing entirely: the padding belonged to the scrolling element, so
 * it scrolled away with the content and the row ended hard against the
 * viewport edge with no trailing space — the last item looked severed rather
 * than scrollable. Negative margins that cancel the parent's gutter, with the
 * same gutter re-applied *inside* the scroller, is the arrangement that was
 * always meant: items line up with the page's measure at rest, the scroll
 * region runs edge to edge so nothing looks clipped, and there is padding
 * again when you reach the end.
 *
 * ## The two rows are also two landmarks
 *
 * `<header>` is the banner; the nav inside it is labelled, and the breadcrumb —
 * a separate slot — is labelled differently. Two `<nav>` elements with the same
 * accessible name are worse than one, because the rotor lists both and neither
 * says which is which.
 */
/**
 * The board's mark: a logo when there is one, the board's name when there is
 * not.
 *
 * ## Why a `<picture>` sometimes and an `<img>` other times
 *
 * `darkSrc` is non-null only when the reader is on "system" and the board has
 * two images — the one case where the server genuinely cannot know which to
 * send. Everywhere else the app has already decided and this renders a plain
 * `<img>`, which is one element, one request and no source selection at all.
 *
 * ## Why the name is still in the markup
 *
 * As `alt`. The header is the only link home on most pages, and an image link
 * with no text is a link a screen reader announces as its URL. The alt text is
 * the board's name unless an operator has written something better.
 *
 * `h-8 w-auto` rather than a fixed pair: a logo is whatever shape its board
 * made it, and constraining the height while letting the width follow is the
 * only rule that does not distort somebody's wordmark. `max-w-[12rem]` is the
 * guard against the operator who uploads a banner.
 */
function BoardMark({ boardTitle, logo }: Pick<HeaderModel, 'boardTitle' | 'logo'>) {
  if (logo === undefined) return <>{boardTitle}</>

  const image = (
    <img
      src={logo.src}
      alt={logo.alt}
      className="h-8 w-auto max-w-48 object-contain"
      /*
       * The header is above the fold on every page, so this is the one image on
       * the board that should not be lazy — and `decoding="async"` keeps it off
       * the critical path anyway.
       */
      decoding="async"
    />
  )

  if (logo.darkSrc === null) return image

  return (
    <picture>
      <source media="(prefers-color-scheme: dark)" srcSet={logo.darkSrc} />
      {image}
    </picture>
  )
}

export function Header({ boardTitle, homeHref, navigation, logo, children }: HeaderModel) {
  return (
    <header className="border-b border-border bg-card">
      <div className={`${PAGE} flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-3`}>
        <a
          href={homeHref}
          className={`inline-flex items-center text-xl font-semibold tracking-tight text-foreground ${LINK}`}
        >
          <BoardMark boardTitle={boardTitle} logo={logo} />
        </a>
        {children}
      </div>

      {/*
       * The nav row is the band, the row above it is the panel. Two tiers in the
       * header rather than one flat block, which is what stops the board's name
       * and its sections reading as a single undifferentiated slab — the same
       * page/band/panel stack the listing below it uses.
       */}
      {navigation.length > 0 && (
        <nav aria-label="Board sections" className="border-t border-border bg-surface">
          {/* The rule is full-bleed; the row inside it is on the measure. */}
          <div className={PAGE}>
            <ul className="-mx-4 flex items-stretch gap-1 overflow-x-auto px-4 text-sm sm:-mx-6 sm:px-6">
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
          </div>
        </nav>
      )}
    </header>
  )
}
