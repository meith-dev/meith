/**
 * F57 — the member's control panel, as a tree.
 *
 * ## It used to be an index and nothing else
 *
 * The panel was a page of nine cards, and every screen it linked to was a
 * dead end: change your avatar, then go *back* to the index to change your
 * signature. That is the shape the ACP had before it grew a rail, and the
 * objection recorded in the layout at the time — "a second copy of those links
 * in a sidebar would be a second list to keep in step" — is answered rather
 * than ignored. There is one list. It is this one, and both the rail and the
 * index read it, exactly as `admin-nav.ts` feeds the ACP's two.
 *
 * ## Four of these are not under `/usercp`
 *
 * Subscriptions, messages and notifications have their own URLs, are linked
 * from e-mails and from the user panel, and are not being moved (see
 * `usercp.ts`'s original note, which still holds). They are *sections of this
 * panel* all the same — a member changing what the board sends them does not
 * care which route tree it is in — so they are in the tree and their route
 * segments render the same shell. That is why the shared matcher may answer
 * `null`: unlike `/admin`, this panel has no single prefix.
 *
 * ## The order is by how often somebody comes for it
 *
 * Messages and notifications first among the "things happening to you";
 * profile, avatar and signature next, as "what other people see"; the account
 * itself last, because changing a password is rare and dangerous to misclick.
 */

import type { PanelNav, PanelSection } from './panel-nav'

import { currentProps, deepestHrefIn, flattenNav, isUnder, sectionHrefIn } from './panel-nav'

export { currentProps, isUnder }

/** The panel's front door — what is waiting, and where everything is. */
export const USERCP_OVERVIEW: PanelSection = {
  href: '/usercp',
  title: 'Overview',
  blurb: 'What is waiting for you, and everything you can change.',
}

export const USERCP_SECTIONS: PanelNav = [
  {
    href: '/messages',
    title: 'Private messages',
    blurb: 'Your inbox, and what you have sent.',
    children: [{ href: '/messages/compose', title: 'Write a message' }],
  },
  {
    href: '/notifications',
    title: 'Notifications',
    blurb: 'What the board has told you, and which of it also reaches you by e-mail.',
    children: [{ href: '/notifications/preferences', title: 'Preferences' }],
  },
  {
    href: '/subscriptions',
    title: 'Subscriptions',
    blurb: 'The threads and forums you follow, and how often you hear about them.',
  },
  {
    href: '/usercp/profile',
    title: 'Profile',
    blurb: 'What other members see about you.',
  },
  {
    href: '/usercp/avatar',
    title: 'Avatar',
    blurb: 'The picture shown beside your posts.',
  },
  {
    href: '/usercp/signature',
    title: 'Signature',
    blurb: 'What appears under every post you make.',
  },
  {
    href: '/usercp/contacts',
    title: 'Buddies and ignored members',
    blurb: 'Who you follow, and whose posts you would rather not read.',
  },
  {
    href: '/usercp/options',
    title: 'Options',
    blurb: 'Your timezone, and how much of a thread fits on a page.',
  },
  {
    href: '/usercp/security',
    title: 'E-mail and password',
    blurb: 'Both need your current password.',
  },
]

/** What the rail renders, in order. */
export const USERCP_NAV: PanelNav = [USERCP_OVERVIEW, ...USERCP_SECTIONS]

/**
 * Which section this path belongs to, or `null` when it is somewhere else on
 * the board entirely.
 *
 * No overview fallback, and that is the difference from the ACP's wrapper: the
 * rail is rendered by four separate route segments, and a stray address inside
 * one of them should light nothing rather than pretend to be the overview.
 */
export function activeSectionHref(pathname: string): string | null {
  return sectionHrefIn(USERCP_NAV, pathname)
}

/** The deepest match — a sub-page where there is one, otherwise its section. */
export function deepestNavHref(pathname: string): string | null {
  return deepestHrefIn(USERCP_NAV, pathname)
}

/** The section or sub-page you are on, for a rail that has to name it. */
export function currentPanelItem(pathname: string): { readonly title: string } | null {
  const deepest = deepestNavHref(pathname)
  if (deepest === null) return null
  return flattenNav(USERCP_NAV).find((item) => item.href === deepest) ?? null
}
