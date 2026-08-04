/**
 * The matching behind a control panel's navigation rail.
 *
 * ## Why this is not in `admin-nav.ts` any more
 *
 * Because the board has two control panels and they should not behave
 * differently. The ACP got a rail first — sections down the side, the one you
 * are in marked, sub-pages appearing under it — and the member's own panel was
 * still a page of cards you had to return to between every screen. Making the
 * second one work like the first meant either copying a hundred lines of
 * longest-prefix matching or lifting them, and a copy is how the two panels
 * start disagreeing about what "you are here" means.
 *
 * So the *shape* of a panel lives here and the panels supply their own trees:
 * `admin-nav.ts` and `usercp-nav.ts` are data plus a couple of bound wrappers.
 *
 * ## Everything is a longest-prefix match
 *
 * `/admin/users/12` lights "Users" because `/admin/users` is the longest href
 * that contains it. `/admin/users/mail` lights "Mass mail" instead, because a
 * sub-page is longer than its section. That one rule covers records, sub-pages
 * and unknown addresses, and it is why no page has to announce itself to the
 * shell that wraps it.
 *
 * ## It answers `null`, and the ACP's own wrapper is what hides that
 *
 * `/admin` is a prefix of every ACP address, so an unrecognised one still lands
 * inside the panel. The member's panel is not like that: its sections are
 * scattered across `/usercp`, `/messages`, `/notifications` and
 * `/subscriptions`, so "nothing here matches" is a real answer and pretending
 * otherwise would light a random item. Callers that have a root decide what to
 * fall back to.
 */

export interface PanelSubsection {
  readonly href: string
  readonly title: string
}

export interface PanelSection {
  readonly href: string
  readonly title: string
  /** One sentence, for the panel index's cards. */
  readonly blurb: string
  /**
   * Screens reachable only from this section, rendered under it while you are
   * in it. Per-*row* screens (`/admin/users/12`) are deliberately never here:
   * they are a record you opened, not a place in the panel.
   */
  readonly children?: readonly PanelSubsection[]
}

export type PanelNav = readonly PanelSection[]

/**
 * Is `pathname` this href or somewhere below it?
 *
 * The trailing slash is the whole point: `/admin/users` must not claim
 * `/admin/users-and-more`, and a board that later grows such a route should
 * not need to remember why the navigation went strange.
 */
export function isUnder(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

function longest(pathname: string, hrefs: readonly string[]): string | null {
  let best: string | null = null
  for (const href of hrefs) {
    if (!isUnder(pathname, href)) continue
    if (best === null || href.length > best.length) best = href
  }
  return best
}

/** Which section this path belongs to, or `null` if it is outside the panel. */
export function sectionHrefIn(nav: PanelNav, pathname: string): string | null {
  return longest(
    pathname,
    nav.map((section) => section.href),
  )
}

/**
 * The deepest thing in the tree that contains this path — a sub-page where
 * there is one, otherwise its section. This is what "you are here" means.
 */
export function deepestHrefIn(nav: PanelNav, pathname: string): string | null {
  return longest(
    pathname,
    nav.flatMap((section) => [
      section.href,
      ...(section.children ?? []).map((child) => child.href),
    ]),
  )
}

/** Every section and sub-page, flat — for finding the one you are on. */
export function flattenNav(nav: PanelNav): readonly (PanelSection | PanelSubsection)[] {
  return nav.flatMap((section) => [section, ...(section.children ?? [])])
}

/**
 * `aria-current` for one navigation link, as props to spread.
 *
 * Only the deepest match gets it, so `/admin/users/mail` does not announce
 * both "Users, current" and "Mass mail, current page". It is `page` when the
 * link *is* the address, and `true` when the address is a record inside it —
 * `/admin/users/12` has no link of its own, and "somewhere in Users" is more
 * useful than nothing at all.
 *
 * Returned as an object rather than a value because the app compiles with
 * `exactOptionalPropertyTypes`: `aria-current={undefined}` is a type error,
 * not an absent attribute.
 */
export function currentProps(
  pathname: string,
  href: string,
  deepest: string | null,
): { readonly 'aria-current'?: 'page' | 'true' } {
  if (href !== deepest) return {}
  return { 'aria-current': pathname === href ? 'page' : 'true' }
}
