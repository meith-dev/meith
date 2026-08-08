/**
 * The moderator control panel, as a tree.
 *
 * ## It was a row of pills and it knew nothing
 *
 * The ModCP's navigation was six bordered links laid out across the top of its
 * layout, hard-coded in that file, with no mark on the one you were reading and
 * no sentence saying what any of them held. Worse, it was rendered by
 * `app/(board)/modcp/layout.tsx` — so it existed on the overview, on My communities
 * and on the log, and **vanished** on the approval queue and the reports list,
 * which live under `/moderation` and are where a moderator actually spends the
 * day. The panel disappeared exactly when you started using it.
 *
 * The member's panel had already met and answered this: its sections live in
 * four route trees, and each of those trees renders the same shell so the rail
 * follows a member into their inbox. `/moderation` gets the same treatment
 * here, and for the same reason — a rail that vanishes the moment you open the
 * queue teaches a moderator that the panel is somewhere they leave.
 *
 * The URLs do not move. `/moderation` and `/moderation/reports` are linked from
 * the ACP's overview, from the board's account menu, from a thread's inline
 * tools and from `warnings.ts`'s paging; `/moderation/warn?user=` is linked
 * from every postbit and every profile. Tidying the file tree at the cost of
 * every one of those is the wrong trade, which is the note `usercp-nav.ts`
 * already records about `/messages`.
 *
 * ## Why this is a function and the other two are constants
 *
 * Because what a moderator may do is not what the next one may do. The address
 * lookup is offered only to somebody who may use it — it is the one section
 * that reads personal data about a member who has done nothing — and the warn
 * screen only to somebody who holds `user.warn`. `ADMIN_SECTIONS` and
 * `USERCP_SECTIONS` are the same list for everybody who can see them at all,
 * so they are constants imported straight into a client module; this one is
 * built per request and handed across as a prop.
 *
 * ## The warn screen is in the tree but is not a place
 *
 * `/moderation/warn` 404s without a `?user=`, so it cannot be a link. Left out
 * of the tree altogether it was worse than useless: longest-prefix matching
 * would hand it to `/moderation` and the rail would say "Approval queue,
 * current" while a moderator was writing a warning. It is listed as a `record`
 * — in the tree for matching, never rendered as somewhere to go, and shown as
 * your position only while you are on it.
 */

import {
  type PanelNav,
  type PanelSection,
  currentProps,
  deepestHrefIn,
  isUnder,
  sectionHrefIn,
} from './panel-nav'

export { currentProps, isUnder }

/** What the panel needs to know to decide which sections it has. */
export interface ModCpNavAccess {
  readonly canWarn: boolean
  readonly canLookUpIp: boolean
}

/** The panel's front door — what is waiting, and where everything is. */
export const MODCP_OVERVIEW: PanelSection = {
  href: '/modcp',
  title: 'Overview',
  blurb: 'What is waiting across the communities you moderate, and where you may act.',
}

/**
 * The sections this moderator has, in the order they are reached for.
 *
 * The queue first, then reports: those two are the work. What you are appointed
 * to and what has been done come after, because they are things you check
 * rather than things you clear.
 */
export function modCpSections(access: ModCpNavAccess): PanelNav {
  return [
    {
      href: '/moderation',
      title: 'Approval queue',
      blurb: 'Posts and threads held for approval in the communities you moderate.',
      children: access.canWarn
        ? [{ href: '/moderation/warn', title: 'Warn a member', record: true }]
        : [],
    },
    {
      href: '/moderation/reports',
      title: 'Reports',
      blurb: 'What members have reported, who has picked it up, and what came of it.',
    },
    {
      href: '/modcp/communities',
      title: 'My communities',
      blurb: 'Where you are appointed, and exactly what you may do in each.',
    },
    {
      href: '/modcp/log',
      title: 'Moderator log',
      blurb: 'What has been done in your communities, by whom, and when.',
    },
    /*
     * Offered only to somebody who may actually use it. The address lookup has
     * its own answer for the same reason it has its own audit row: it is the
     * one section that reads personal data about somebody who has done nothing.
     */
    ...(access.canLookUpIp
      ? [
          {
            href: '/modcp/ip',
            title: 'Address lookup',
            blurb: 'Who else has posted from an address. Every lookup is logged.',
          },
        ]
      : []),
  ]
}

/** What the rail renders, in order. */
export function modCpNav(access: ModCpNavAccess): PanelNav {
  return [MODCP_OVERVIEW, ...modCpSections(access)]
}

/**
 * Which section this path belongs to, or `null` when it is somewhere else.
 *
 * No overview fallback, and that is the difference from the ACP's wrapper: this
 * panel straddles `/modcp` and `/moderation`, so — like the member's — "outside
 * the tree" is a real state and lighting nothing is the truthful answer.
 */
export function activeSectionHref(
  access: ModCpNavAccess,
  pathname: string,
): string | null {
  return sectionHrefIn(modCpNav(access), pathname)
}

/** The deepest match — a record where there is one, otherwise its section. */
export function deepestNavHref(
  access: ModCpNavAccess,
  pathname: string,
): string | null {
  return deepestHrefIn(modCpNav(access), pathname)
}
