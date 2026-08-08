/**
 * The control panel's map — the one place that knows what is in the ACP.
 *
 * ## Why it is not two lists
 *
 * It was: the index rendered a grid of eleven cards from a constant in
 * `app/admin/page.tsx`, and the shell rendered a header with two links in it.
 * The shell's list was the one an administrator actually needed — it is on
 * every screen — and it did not exist. Reaching the community tree from the
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
 * Per-row screens (`/admin/communities/12`, `/admin/users/12`) are deliberately not
 * here. They are not places in the panel, they are a record you opened, and
 * the navigation stays on the section they belong to while you are in one.
 *
 * ## No file reads what a path means twice
 *
 * The matching lives in `panel-nav.ts` and is shared with the member's own
 * control panel, which grew the same rail afterwards. What is here is the
 * tree, plus wrappers that bind the shared matchers to it — so
 * `/admin/users/12` highlights "Users" and `/admin/users/mail` highlights
 * "Mass mail" without either page saying so, by the same rule the other panel
 * uses.
 */

import {
  type PanelNav,
  type PanelSection,
  currentProps,
  deepestHrefIn,
  isUnder,
  sectionHrefIn,
} from './panel-nav'
import { SETTING_GROUP_NAV } from './setting-groups'

export { currentProps, isUnder }
export type {
  PanelSection as AdminSection,
  PanelSubsection as AdminSubsection,
} from './panel-nav'

/**
 * The panel's front door. Kept out of `ADMIN_SECTIONS` because the index does
 * not list itself, and kept in `ADMIN_NAV` because every other screen needs a
 * way back to it that is not the browser's history.
 */
export const ADMIN_OVERVIEW: PanelSection = {
  href: '/admin',
  title: 'Overview',
  blurb: 'What is waiting, the board at a glance, and the latest activity.',
}

export const ADMIN_SECTIONS: PanelNav = [
  {
    href: '/admin/settings',
    title: 'Board settings',
    blurb: 'Every setting this build has, grouped and searchable.',
    /*
     * The ten groups, from the same list the screen itself renders. They were a
     * row of chips in the page body that read as prose rather than as
     * navigation; see `SETTING_GROUP_NAV` for why they are here instead.
     */
    children: SETTING_GROUP_NAV,
  },
  {
    href: '/admin/communities',
    title: 'Communities',
    blurb: 'The tree, each community’s options, and the permission matrix.',
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
export const ADMIN_NAV: PanelNav = [ADMIN_OVERVIEW, ...ADMIN_SECTIONS]

/**
 * Which section this path belongs to. **Always answers**, unlike the shared
 * matcher: `/admin` is a prefix of everything under the panel, so an address
 * this file has never heard of lands on the overview rather than on nothing.
 */
export function activeSectionHref(pathname: string): string {
  return sectionHrefIn(ADMIN_NAV, pathname) ?? ADMIN_OVERVIEW.href
}

/**
 * The deepest thing in the tree that contains this path — a sub-page where
 * there is one, otherwise its section. This is what "you are here" means.
 */
export function deepestNavHref(pathname: string): string {
  return deepestHrefIn(ADMIN_NAV, pathname) ?? ADMIN_OVERVIEW.href
}
