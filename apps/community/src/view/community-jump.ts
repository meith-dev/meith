import { buildTree, keepVisibleSubtrees, type CommunityNode } from '@meith/communities'
import type { CommunityJumpModel, CommunityJumpOption } from '@meith/theme-kit'

/**
 * F27 — the jump box's view model.
 *
 * Pure, like every other builder in this directory: rows and a visibility set
 * in, a model out. The permission decision is made by the caller through
 * `Authorizer.communityIdsWhere`; this only arranges what it is given.
 *
 * ## Whole subtrees, not rows
 *
 * The same rule the board index follows, through the same function. Filtering
 * row-by-row and then building the tree would promote a hidden category's
 * visible children to the top level — announcing that they exist, what they are
 * called, and making the board's shape depend on who is looking. In a jump box
 * that leak is *worse* than on the index, because the box appears on every page
 * including ones a member reached without going through the index at all.
 *
 * ## Categories are listed and disabled
 *
 * MyBB lists them, and dropping them would leave the indentation meaningless —
 * a community three levels deep with no visible ancestors reads as top-level. They
 * are marked `isCategory` so the theme can render them as headings rather than
 * destinations.
 */

export interface CommunityJumpRow {
  readonly id: number
  readonly parentId: number | null
  readonly displayOrder: number
  readonly type: string
  readonly title: string
  readonly slug: string
}

export interface CommunityJumpInput {
  readonly rows: readonly CommunityJumpRow[]
  readonly visibleCommunityIds: ReadonlySet<number>
  /** The community being viewed, pre-selected. `null` off a community page. */
  readonly currentCommunityId?: number | null
  /** Where the form submits. The app owns the URL, not the theme. */
  readonly action?: string
  /** The query-parameter name. The app owns this too. */
  readonly field?: string
}

export const JUMP_ACTION = '/jump'
export const JUMP_FIELD = 'community'

/**
 * The submitted community id, or `null` for "no usable selection".
 *
 * Pure and here rather than inline in the page, because the page is a
 * redirect-or-404 with nothing to assert on: every branch of it ends in a
 * `throw`, so the only way to test the parsing is to test it separately.
 *
 * **A repeated parameter takes its first value.** `?community=3&community=9` arrives as
 * an array, and the rule has to be written down somewhere: the alternative that
 * looks equally reasonable — refuse an ambiguous submission — turns a URL
 * anybody can type into a way of telling 404 apart from "ambiguous", which is
 * the oracle the route exists to avoid. First value wins, and an id the viewer
 * may not see is the same 404 either way.
 *
 * `null` means the index, not an error: it is what pressing "Go" without
 * choosing anything does, which is an accident rather than a probe.
 */
export function parseJumpTarget(raw: string | readonly string[] | undefined): number | null {
  const first = Array.isArray(raw) ? raw[0] : (raw as string | undefined)
  if (first === undefined || !/^\d+$/.test(first)) return null
  return Number(first)
}

export function buildCommunityJumpModel(input: CommunityJumpInput): CommunityJumpModel {
  const visible = keepVisibleSubtrees(input.rows, (row) => input.visibleCommunityIds.has(row.id))

  /*
   * Depth is computed from the tree rather than read from the stored `depth`
   * column. The column would in fact be right — `keepVisibleSubtrees` only keeps
   * a row whose ancestors all survived, so absolute and visible depth agree —
   * but that is a two-step argument resting on another function's invariant,
   * and the traversal already has the number in hand.
   */
  const communities: CommunityJumpOption[] = []

  const walk = (node: CommunityNode<CommunityJumpRow>, depth: number): void => {
    communities.push({
      value: String(node.id),
      label: node.title,
      depth,
      isCategory: node.type === 'category',
      isSelected: node.id === (input.currentCommunityId ?? null),
    })
    for (const child of node.children) walk(child, depth + 1)
  }

  for (const root of buildTree(visible)) walk(root, 0)

  return {
    action: input.action ?? JUMP_ACTION,
    field: input.field ?? JUMP_FIELD,
    communities,
    submitLabel: 'Go',
    label: 'Jump to community',
  }
}
