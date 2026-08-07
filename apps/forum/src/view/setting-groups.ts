/**
 * The setting groups: their order, their labels, and their addresses.
 *
 * ## Why this is not in `admin-settings.ts`
 *
 * Because the ACP's rail needs the list, and the rail is a client module.
 *
 * `admin-settings.ts` imports `SETTING_DEFINITIONS` from `@meith/settings`,
 * which reaches the settings store and `@meith/core`'s logger. That is exactly
 * right for a screen rendered on the server and exactly wrong for anything the
 * browser loads — importing the group list from there pulled the whole settings
 * package into the client bundle, and Turbopack said so rather than shipping
 * it, which is the failure mode you want.
 *
 * So the *names* live here, in a leaf that imports one **type** and nothing
 * else — a type import is erased at compile time, so this module has no runtime
 * dependency at all. `admin-settings.ts` builds the screen from it and
 * `admin-nav.ts` builds the rail from it, which keeps the promise that matters:
 * one list, so a group cannot appear in the navigation and not on the screen.
 */

import type { SettingGroup } from '@meith/settings'

export const GROUP_LABELS: Record<SettingGroup, string> = {
  board: 'Board',
  registration: 'Registration',
  posting: 'Posting',
  display: 'Display',
  search: 'Search',
  mail: 'Mail',
  reputation: 'Reputation',
  security: 'Security',
  antispam: 'Anti-spam',
  privacy: 'Privacy',
}

/** The order the groups appear in: the order an operator sets a board up. */
export const GROUP_ORDER: readonly SettingGroup[] = [
  'board',
  'registration',
  'posting',
  'display',
  'search',
  'reputation',
  'mail',
  'security',
  /*
   * Beside security rather than at the end: it is a question about the board's
   * obligations to its readers, and an operator answering it is usually
   * answering security's questions in the same sitting.
   */
  'privacy',
  /*
   * Last, because it is the group an operator reaches for when something is
   * already wrong rather than while setting a board up — and because every
   * default in it is inert, so there is nothing here to do on day one.
   */
  'antispam',
]

/** The group a bare `/admin/settings` means. */
export const DEFAULT_SETTING_GROUP: SettingGroup = GROUP_ORDER[0]!

/**
 * The groups as the panel's rail lists them.
 *
 * ## Why the rail and not a row of chips
 *
 * They were a row of ten chips in the page body, above the fields and below a
 * search box, with the current one marked by a faint grey pill. Nothing said
 * "this row is the navigation": the inactive labels were the same size, weight
 * and colour as the body text beside them, there was no rule or container to
 * bound them, and at ten items the row was one browser width away from wrapping
 * into something that reads as a broken table. `ViewTabs` — the board's one tab
 * shape — says in its own comments that it does not survive past about five,
 * and it is right.
 *
 * Ten items in a vertical list is not a hard problem, and the panel already had
 * one: the rail renders a section's sub-pages while you are in it, which is how
 * Mass mail sits under Users and Announcements under Content. Setting groups
 * are the same relationship, and putting them there costs no new idea, scans in
 * one movement, cannot overflow at any width, and makes a group reachable from
 * anywhere in the panel rather than only from the screen it is already on.
 *
 * ## They keep their query string
 *
 * `?group=mail` rather than `/admin/settings/mail`. The original decision — the
 * filter lives in the URL so it can be bookmarked and sent — is a good one, and
 * these are one screen filtered ten ways rather than ten screens. The rail
 * learned to read a query instead; see `isUnder` in `panel-nav.ts`.
 */
export const SETTING_GROUP_NAV: readonly {
  readonly href: string
  readonly title: string
}[] = GROUP_ORDER.map((group) => ({
  href: `/admin/settings?group=${group}`,
  title: GROUP_LABELS[group],
}))
