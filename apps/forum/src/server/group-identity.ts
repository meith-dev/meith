import 'server-only'

/**
 * A member's group, as the board shows it: a title, a colour, a badge.
 *
 * ## Why the colour is a class and not an inline style
 *
 * Because it has to change with the reader's colour scheme, and a `style`
 * attribute cannot hold two answers. A member on "system" has no `.dark` class
 * on the page — their dark mode comes from a media query — so the only place
 * both values can live is a stylesheet, in the same three blocks the theme
 * cascade already uses.
 *
 * So the board emits one rule per coloured group into `<head>` and every
 * username carries `gname-<id>`. One rule per *group*, not per member, which is
 * what makes a thread page with twenty posters cost twenty class names and
 * nothing else.
 *
 * ## Why it is not a design token
 *
 * `usergroups.badge_token` tried that and could not work: the token list is
 * compiled into `globals.css`, so it is fixed at four group tokens, while
 * groups are rows a board creates. It is also the wrong ownership — a member's
 * colour is a fact about the board's hierarchy, and routing it through a token
 * would hand it to whichever theme the *reader* picked.
 */
import { CacheTags } from '@meith/core'
import {
  PostgresGroupIdentityRepository,
  getDb,
  type GroupIdentity,
  type MemberStanding,
} from '@meith/db'
import { unstable_cache } from 'next/cache'
import { cache } from 'react'

import type { MemberIdentity } from '@/view/member-identity'

import { getContainer } from './container'
import { badgeSrc } from './group-badge'
import { currentColourScheme } from './theme'
import { groupNameClass, renderGroupNameStyle } from './theme-style'

/** The class every username of this group carries. */
export type { MemberIdentity }
export { groupNameClass }

function repository(): PostgresGroupIdentityRepository | null {
  return getContainer().dataSource === 'postgres'
    ? new PostgresGroupIdentityRepository(getDb())
    : null
}

/**
 * Every group with a colour, cached board-wide.
 *
 * Tagged `groups`, which the group editor already invalidates when it writes —
 * so a colour change reaches every page on the next render rather than when a
 * cache felt like it.
 */
const loadStyled = unstable_cache(
  async (): Promise<readonly GroupIdentity[]> => {
    const repo = repository()
    return repo === null ? [] : repo.styled()
  },
  ['group-identity-styles'],
  { tags: [CacheTags.groups()] },
)

/**
 * The stylesheet's group rules, for `<head>`.
 *
 * The rendering is `renderGroupNameStyle`, beside the theme cascade it mirrors
 * and where it can be tested without a database; this is the read, the cache and
 * the "never fail a page over a colour" decision.
 */
export const getGroupStyle = cache(async (): Promise<string> => {
  const groups = await loadStyled().catch(() => [])
  return renderGroupNameStyle(
    groups.map((group) => ({
      groupId: group.groupId,
      light: group.nameColorLight,
      dark: group.nameColorDark,
    })),
  )
})

/**
 * Which badge image this reader gets, resolved on the server.
 *
 * The board logo's rule, and it is the same rule for the same reason: a theme
 * doing this in CSS would be wrong for the commonest reader, the one on
 * "system", who has no `.dark` class because their dark mode is a media query.
 * A board with only one badge uses it in both schemes — an operator who
 * uploaded one has said what they want beside the name.
 */
function resolveBadge(
  group: GroupIdentity,
  scheme: 'light' | 'dark' | 'system',
): MemberIdentity['badge'] {
  const light = group.badgeImageLight ?? group.badgeImageDark
  const dark = group.badgeImageDark ?? group.badgeImageLight
  if (light === null || dark === null) return null

  const alt = group.title
  const lightSrc = badgeSrc(group.groupId, group.badgeImageLight === null ? 'dark' : 'light', light)
  const darkSrc = badgeSrc(group.groupId, group.badgeImageDark === null ? 'light' : 'dark', dark)

  if (scheme === 'light') return { src: lightSrc, darkSrc: null, alt }
  if (scheme === 'dark') return { src: darkSrc, darkSrc: null, alt }
  return { src: lightSrc, darkSrc: darkSrc === lightSrc ? null : darkSrc, alt }
}

/**
 * The read, memoised per request on a *string* key.
 *
 * `React.cache` compares arguments the way `useMemo` does — by identity for
 * anything that is not primitive — so a function taking `number[]` is not
 * memoised at all: every caller builds a fresh array and every call misses.
 * The ids are sorted and joined so that two callers asking for the same people
 * ask the same question, whatever order they assembled their list in.
 */
const load = cache(async (key: string): Promise<ReadonlyMap<number, MemberStanding>> => {
  const repo = repository()
  if (repo === null) return new Map()
  return repo.forUsers(key.split(',').map(Number)).catch(() => new Map<number, MemberStanding>())
})

/**
 * Resolve these members' groups, once per request.
 *
 * Failure is an empty map, not an exception: a name without a colour is a
 * cosmetic loss, and taking a thread page down for it would make the group
 * table a dependency of reading the board.
 */
export async function identitiesFor(
  userIds: readonly number[],
): Promise<ReadonlyMap<number, MemberIdentity>> {
  const ids = [...new Set(userIds)].sort((a, b) => a - b)
  if (ids.length === 0) return new Map()

  const [rows, scheme] = await Promise.all([load(ids.join(',')), currentColourScheme()])

  return new Map(
    [...rows].map(([userId, group]) => [
      userId,
      {
        groupId: group.groupId,
        title: group.title,
        nameClass:
          group.nameColorLight === null && group.nameColorDark === null
            ? null
            : groupNameClass(group.groupId),
        badge: resolveBadge(group, scheme),
        reputation: group.reputation,
      },
    ]),
  )
}
