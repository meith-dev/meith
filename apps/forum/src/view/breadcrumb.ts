/**
 * The breadcrumb trail (F27).
 *
 * ## The slot existed; nothing rendered it
 *
 * `Navigation` has been in the theme contract since F27, is marked `stable` in
 * `SLOT_STABILITY`, and is implemented by both shipped themes — with a careful
 * note in each about `aria-current` on the last crumb. No page had ever
 * composed one. So a member three forums deep had exactly one way back up: the
 * "Forums" item in the board navigation, which returns to the index and
 * discards the whole path.
 *
 * This builds the trail, and the forum and thread pages render it. It is the
 * one navigation aid a forum cannot do without, because a forum's structure
 * *is* its tree and a URL like `/thread/22-what-are-you-reading` says nothing
 * about where the thread lives.
 *
 * ## It costs no query
 *
 * `forums.path` is the materialised ancestor chain (root first, inclusive of
 * self), so the ancestors of a forum are a parse of a string it already
 * carries. The rows come from `forums.listAll()`, which every one of these
 * pages has already called and which `CachedForumRepository` serves once per
 * request. A trail is therefore string work over data in hand.
 *
 * ## What is deliberately not in it
 *
 * **Ancestors the viewer cannot see.** A forum's parent may be invisible to
 * this member, and a breadcrumb naming it — even without a working link — is a
 * private category's title leaked into every thread page beneath it. Invisible
 * ancestors are dropped, which can leave a trail with a gap in it; a gap is the
 * correct answer, because the alternative is a permission decision made in
 * markup.
 *
 * **A crumb for the current page that links to itself.** The last item is the
 * page you are on, and the themes render it as text with `aria-current="page"`.
 * It is here because the trail should say where it ends, not because anything
 * should click it.
 */

import { ancestorIds } from '@meith/forums'
import type { LinkModel } from '@meith/theme-kit'

import { forumHref } from './board-index'

/** The little a trail needs from a forum row. */
export interface CrumbForum {
  readonly id: number
  readonly slug: string
  readonly title: string
  readonly path: string
}

export interface BreadcrumbInput {
  /** Every forum, from `forums.listAll()`. Order does not matter. */
  readonly forums: readonly CrumbForum[]
  /** The forum the page is in, or under. */
  readonly forumId: number
  /**
   * Ids the viewer may see. Omit when the caller has already filtered
   * `forums` — passing an unfiltered list *and* no set would publish the
   * board's whole private structure, so the ambiguity is worth the parameter.
   */
  readonly visibleForumIds?: ReadonlySet<number>
  /**
   * A final, unlinked crumb — a thread's title, "New thread", "Reply". Absent
   * on a forum page, where the forum itself is the last crumb.
   */
  readonly leaf?: string
  /** What the root crumb is called. The board's index, always first. */
  readonly homeLabel?: string
}

/**
 * The trail, root first.
 *
 * Returns at least the home crumb, so a caller never has to decide whether an
 * empty list means "no trail" or "not built" — the themes take `items.length
 * === 0` as "render nothing", and that should mean the page chose not to have
 * one.
 */
export function buildBreadcrumb({
  forums,
  forumId,
  visibleForumIds,
  leaf,
  homeLabel = 'Forums',
}: BreadcrumbInput): readonly LinkModel[] {
  const byId = new Map(forums.map((forum) => [forum.id, forum]))
  const self = byId.get(forumId)

  const items: LinkModel[] = [{ label: homeLabel, href: '/' }]
  if (self === undefined) {
    /*
     * A forum the caller could not find. Not an error: the trail degrades to
     * the root, which is still a way back, and a page that renders is better
     * than a page that throws over a decoration.
     */
    if (leaf !== undefined) items.push({ label: leaf, href: '' })
    return items
  }

  const visible = (id: number) => visibleForumIds === undefined || visibleForumIds.has(id)

  for (const ancestorId of ancestorIds(self.path)) {
    const ancestor = byId.get(ancestorId)
    if (ancestor === undefined || !visible(ancestor.id)) continue
    items.push({ label: ancestor.title, href: forumHref(ancestor) })
  }

  items.push({ label: self.title, href: forumHref(self) })

  /*
   * The leaf carries `href: ''` rather than its own URL. Themes key their list
   * on `href` and mark the last crumb `aria-current="page"` instead of linking
   * it, so the value is never used as a destination — and a real URL here would
   * be an invitation to start linking the page to itself.
   */
  if (leaf !== undefined) items.push({ label: leaf, href: '' })

  return items
}
