/**
 * The matching behind a control panel's navigation rail.
 *
 * ## Why this is not in `admin-nav.ts` any more
 *
 * Because the board has three control panels and they should not behave
 * differently. The ACP got a rail first — sections down the side, the one you
 * are in marked, sub-pages appearing under it — and the member's own panel was
 * still a page of cards you had to return to between every screen. Making the
 * second one work like the first meant either copying a hundred lines of
 * longest-prefix matching or lifting them, and a copy is how the two panels
 * start disagreeing about what "you are here" means. The ModCP was the third
 * and the worst of the three: a row of undifferentiated pills that never marked
 * which one you were on, and that vanished entirely the moment you opened the
 * approval queue, because the queue lives in another route tree.
 *
 * So the *shape* of a panel lives here and the panels supply their own trees:
 * `admin-nav.ts`, `usercp-nav.ts` and `modcp-nav.ts` are data plus a couple of
 * bound wrappers.
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
  /**
   * A screen you *arrive* at rather than one you can go to — reached from a
   * post, a profile or a row, and meaningless without the query string that
   * brought you (`/moderation/warn?user=`, which 404s bare).
   *
   * It is in the tree so the rail can say where you are, and it is marked so
   * the rail never offers it as a link. Without the flag a panel had two bad
   * options: leave the screen out and watch the rail light the wrong section
   * for it, or list it and offer a link that answers 404.
   */
  readonly record?: boolean
}

export interface PanelSection {
  readonly href: string
  readonly title: string
  /** One sentence, for the panel index's cards. */
  readonly blurb: string
  /**
   * Screens reachable only from this section, rendered under it while you are
   * in it. Per-*row* screens (`/admin/users/12`) are deliberately never here:
   * they are a record you opened, not a place in the panel — unless the record
   * would otherwise light the wrong section, which is what `record` is for.
   */
  readonly children?: readonly PanelSubsection[]
}

export type PanelNav = readonly PanelSection[]

/** An address split into its path and the parameters that qualify it. */
function parts(href: string): { path: string; params: URLSearchParams } {
  const cut = href.indexOf('?')
  if (cut === -1) return { path: href, params: new URLSearchParams() }
  return { path: href.slice(0, cut), params: new URLSearchParams(href.slice(cut + 1)) }
}

/**
 * Does the item's query, if it has one, agree with where we are?
 *
 * Only the parameters the *item* names are compared. `/admin/settings?group=mail`
 * is still where you are when the address also carries `&advanced=1`, because
 * `advanced` is a filter over the screen rather than a different screen.
 */
function paramsAgree(here: URLSearchParams, wanted: URLSearchParams): boolean {
  for (const [key, value] of wanted) {
    if (here.get(key) !== value) return false
  }
  return true
}

/**
 * Is `location` this href or somewhere below it?
 *
 * The trailing slash is the whole point: `/admin/users` must not claim
 * `/admin/users-and-more`, and a board that later grows such a route should
 * not need to remember why the navigation went strange.
 *
 * ## Both sides may carry a query, and that is what puts the setting groups in the rail
 *
 * A control panel's second level is not always a route. The ACP's ten setting
 * groups are one screen filtered ten ways — `?group=mail` — because the filter
 * belongs in the URL, so it can be bookmarked, sent to somebody, and reached
 * with the back button. That was a good decision and it left the groups with
 * nowhere to live in the navigation, so they were a row of chips in the page
 * body that nobody noticed.
 *
 * So an item's href may name the parameters that make it *that* item, and the
 * caller passes `pathname + search` rather than a bare pathname. An item with
 * no query behaves exactly as it always did — the section `/admin/settings`
 * still claims every address under it, whatever the query says — which is why
 * every other caller needed no change.
 */
export function isUnder(location: string, href: string): boolean {
  const here = parts(location)
  const want = parts(href)
  if (here.path !== want.path && !here.path.startsWith(`${want.path}/`)) return false
  return paramsAgree(here.params, want.params)
}

/**
 * Is this href the address itself, rather than something containing it?
 *
 * The distinction `aria-current` needs: `page` for the screen you are on,
 * `true` for a record inside a section that has no link of its own.
 */
export function isHere(location: string, href: string): boolean {
  const here = parts(location)
  const want = parts(href)
  return here.path === want.path && paramsAgree(here.params, want.params)
}

/**
 * The most specific href that contains this location.
 *
 * Length is the tie-break, and a query counts towards it — which is what makes
 * `/admin/settings?group=mail` beat the `/admin/settings` it sits under.
 */
function longest(location: string, hrefs: readonly string[]): string | null {
  let best: string | null = null
  for (const href of hrefs) {
    if (!isUnder(location, href)) continue
    if (best === null || href.length > best.length) best = href
  }
  return best
}

/** Which section this location belongs to, or `null` if it is outside the panel. */
export function sectionHrefIn(nav: PanelNav, location: string): string | null {
  return longest(
    location,
    nav.map((section) => section.href),
  )
}

/**
 * The deepest thing in the tree that contains this location — a sub-page where
 * there is one, otherwise its section. This is what "you are here" means.
 */
export function deepestHrefIn(nav: PanelNav, location: string): string | null {
  return longest(
    location,
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
 * The sub-pages to draw under an open section.
 *
 * Everything the section lists, minus the records you are not currently in. A
 * record is in the tree so that landing on it marks the rail rather than
 * lighting whichever section happens to be a prefix of it; it is not a
 * destination, so it appears as your position and at no other time.
 */
export function visibleChildren(
  section: PanelSection,
  deepest: string | null,
): readonly PanelSubsection[] {
  return (section.children ?? []).filter(
    (child) => child.record !== true || child.href === deepest,
  )
}

/**
 * How many things are waiting behind each address, keyed by href.
 *
 * A rail that says "Reports 4" is the difference between a panel you check and
 * a panel you remember to check. Only a panel whose sections have a countable
 * backlog passes any — the ACP's do not, and inventing a number for "Board
 * settings" would be worse than the blank the rail draws instead.
 *
 * Zero and absent mean the same thing and both render nothing: a badge that
 * sits at 0 is a badge nobody reads at 4.
 */
export type PanelCounts = Readonly<Record<string, number>>

/** The badge for one address, or `null` when there is nothing to say. */
export function countFor(counts: PanelCounts | undefined, href: string): number | null {
  const count = counts?.[href] ?? 0
  return count > 0 ? count : null
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
  location: string,
  href: string,
  deepest: string | null,
): { readonly 'aria-current'?: 'page' | 'true' } {
  if (href !== deepest) return {}
  return { 'aria-current': isHere(location, href) ? 'page' : 'true' }
}
