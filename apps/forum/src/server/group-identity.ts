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
import { PostgresGroupIdentityRepository, getDb, type GroupIdentity } from '@meith/db'
import { unstable_cache } from 'next/cache'
import { cache } from 'react'

import { getContainer } from './container'
import { assertSafeCssValue } from './theme-style'

/** The class every username of this group carries. */
export function groupNameClass(groupId: number): string {
  return `gname-${groupId}`
}

/** What a page needs to render one member's name and standing. */
export interface MemberIdentity {
  readonly groupId: number
  /** The display group's title — what the postbit shows under a name. */
  readonly title: string
  /** `null` when the group has no colour in either scheme. */
  readonly nameClass: string | null
  /** Badge image URLs, already resolved for the reader's scheme. */
  readonly badge: { readonly src: string; readonly darkSrc: string | null } | null
}

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
 * Three blocks per scheme for the reason `renderBoardStyle` gives: `.dark` is a
 * class this board's own control sets, and a reader who has never touched it
 * has no class at all — the media query is what covers them, and `:not(.light)`
 * is what lets an explicit "light, please" beat the operating system.
 *
 * Values are validated here rather than trusted from the row. They arrive from
 * a settings-like column an operator edits and a restored backup carries, and
 * they are about to be written into a `<style>` block — the same argument the
 * theme tokens get, and the same validator.
 */
export const getGroupStyle = cache(async (): Promise<string> => {
  const groups = await loadStyled().catch(() => [])
  if (groups.length === 0) return ''

  /*
   * Built selector-first rather than by rewriting generated CSS. An earlier
   * draft produced the light rules and regex-replaced their selectors to make
   * the dark ones, which works until a colour value happens to contain the
   * pattern — and is unreadable long before that.
   */
  const block = (
    pick: (group: GroupIdentity) => string | null,
    prefix: string,
  ): string =>
    groups
      .map((group) => {
        const colour = pick(group)
        if (colour === null) return ''
        assertSafeCssValue(`group ${group.groupId} colour`, colour)
        return `${prefix}.${groupNameClass(group.groupId)}{color:${colour};}`
      })
      .join('')

  const dark = block((group) => group.nameColorDark, '.dark ')

  return (
    block((group) => group.nameColorLight, '') +
    dark +
    (dark === ''
      ? ''
      : `@media (prefers-color-scheme: dark){${block(
          (group) => group.nameColorDark,
          ':root:not(.light) ',
        )}}`)
  )
})

/**
 * Resolve these members' groups, once per request.
 *
 * Memoised with `React.cache` so a thread page that renders a postbit, a
 * "started by" and a last-poster for the same person asks once. Failure is an
 * empty map, not an exception: a name without a colour is a cosmetic loss, and
 * taking a thread page down for it would make the group table a dependency of
 * reading the board.
 */
export const identitiesFor = cache(
  async (userIds: readonly number[]): Promise<ReadonlyMap<number, MemberIdentity>> => {
    const repo = repository()
    const ids = [...new Set(userIds)]
    if (repo === null || ids.length === 0) return new Map()

    const rows = await repo.forUsers(ids).catch(() => new Map<number, GroupIdentity>())

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
          badge: null,
        },
      ]),
    )
  },
)
