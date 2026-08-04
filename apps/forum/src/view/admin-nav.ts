/**
 * The control panel's map — the one place that knows what is in the ACP.
 *
 * ## Why it is not two lists
 *
 * It was: the index rendered a grid of eleven cards from a constant in
 * `app/admin/page.tsx`, and the shell rendered a header with two links in it.
 * The shell's list was the one an administrator actually needed — it is on
 * every screen — and it did not exist. Reaching the forum tree from the
 * settings page meant going back to the index and finding the right card,
 * which is the navigation pattern of a table of contents rather than of a
 * panel somebody works in.
 *
 * So the sections live here, and both the shell's navigation and the index's
 * grid read them. The two cannot drift, and adding a screen to the panel is
 * one entry rather than one entry plus a link somebody will forget.
 *
 * ## Sub-pages are listed, but only where you are
 *
 * A few sections have screens under them that are reachable *only* from the
 * section's own page — mass mail, pruning, promotions. They are in the tree
 * here, and the navigation renders them under whichever section you are
 * currently in. Rendering all of them all of the time would put seventeen rows
 * in a list whose value is that you can scan it.
 *
 * Per-row screens (`/admin/forums/12`, `/admin/users/12`) are deliberately not
 * here. They are not places in the panel, they are a record you opened, and
 * the navigation stays on the section they belong to while you are in one.
 *
 * ## No file reads what a path means twice
 *
 * `activeSectionHref` and `deepestNavHref` are longest-prefix matches over the
 * same tree, which is what makes `/admin/users/12` highlight "Users" and
 * `/admin/users/mail` highlight "Mass mail" without either page saying so.
 * They are pure string functions with tests, because "which nav item is lit"
 * is exactly the kind of thing that silently rots.
 */

export interface AdminSubsection {
  readonly href: string
  readonly title: string
}

export interface AdminSection {
  readonly href: string
  readonly title: string
  /** One sentence, for the index's cards and the navigation's `title`. */
  readonly blurb: string
  readonly children?: readonly AdminSubsection[]
}

/**
 * The panel's front door. Kept out of `ADMIN_SECTIONS` because the index does
 * not list itself, and kept in `ADMIN_NAV` because every other screen needs a
 * way back to it that is not the browser's history.
 */
export const ADMIN_OVERVIEW: AdminSection = {
  href: '/admin',
  title: 'Overview',
  blurb: 'What is waiting, the board at a glance, and the latest activity.',
}

export const ADMIN_SECTIONS: readonly AdminSection[] = [
  {
    href: '/admin/settings',
    title: 'Board settings',
    blurb: 'Every setting this build has, grouped and searchable.',
  },
  {
    href: '/admin/forums',
    title: 'Forums',
    blurb: 'The tree, each forum’s options, and the permission matrix.',
  },
  {
    href: '/admin/groups',
    title: 'Groups',
    blurb: 'What each group allows, promotions, and mass membership changes.',
    children: [
      { href: '/admin/groups/promotions', title: 'Promotions' },
      { href: '/admin/groups/memberships', title: 'Mass membership' },
    ],
  },
  {
    href: '/admin/users',
    title: 'Users',
    blurb: 'Find an account, change it, merge or prune, or mail the board.',
    children: [
      { href: '/admin/users/mail', title: 'Mass mail' },
      { href: '/admin/users/prune', title: 'Prune members' },
    ],
  },
  {
    href: '/admin/content',
    title: 'Content',
    blurb: 'Announcements, attachments, and the housekeeping around them.',
    children: [
      { href: '/admin/content/announcements', title: 'Announcements' },
      { href: '/admin/content/attachments', title: 'Attachments' },
    ],
  },
  {
    href: '/admin/antispam',
    title: 'Anti-spam',
    blurb: 'The honeypot, the question, the limits, and first-post moderation.',
  },
  {
    href: '/admin/themes',
    title: 'Themes',
    blurb: 'Installed themes, their tokens, and this board’s overrides.',
  },
  {
    href: '/admin/plugins',
    title: 'Plugins',
    blurb: 'What is installed, what it may do, and what has been failing.',
  },
  {
    href: '/admin/api-tokens',
    title: 'API tokens',
    blurb: 'Issue and revoke tokens, and see what each one may reach.',
  },
  {
    href: '/admin/system',
    title: 'System',
    blurb: 'Scheduled tasks, the search index, caches, and the build.',
  },
  {
    href: '/admin/log',
    title: 'Admin log',
    blurb: 'Every administrative and moderation action, with who and from where.',
  },
]

/** What the shell's navigation renders, in order. */
export const ADMIN_NAV: readonly AdminSection[] = [ADMIN_OVERVIEW, ...ADMIN_SECTIONS]

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

function longest(pathname: string, hrefs: readonly string[]): string {
  let best = ADMIN_OVERVIEW.href
  for (const href of hrefs) {
    if (isUnder(pathname, href) && href.length > best.length) best = href
  }
  return best
}

/**
 * Which section this path belongs to. Always answers: `/admin` is a prefix of
 * everything under the panel, so an address this file has never heard of lands
 * on the overview rather than on nothing.
 */
export function activeSectionHref(pathname: string): string {
  return longest(
    pathname,
    ADMIN_NAV.map((section) => section.href),
  )
}

/**
 * The deepest thing in the tree that contains this path — a sub-page where
 * there is one, otherwise its section. This is what "you are here" means.
 */
export function deepestNavHref(pathname: string): string {
  return longest(
    pathname,
    ADMIN_NAV.flatMap((section) => [
      section.href,
      ...(section.children ?? []).map((child) => child.href),
    ]),
  )
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
  deepest: string,
): { readonly 'aria-current'?: 'page' | 'true' } {
  if (href !== deepest) return {}
  return { 'aria-current': pathname === href ? 'page' : 'true' }
}
