import { buildTree, keepVisibleSubtrees, type ForumNode } from '@meith/forums'
import type { ForumJumpModel, ForumJumpOption } from '@meith/theme-kit'

/**
 * F27 — the jump box's view model.
 *
 * Pure, like every other builder in this directory: rows and a visibility set
 * in, a model out. The permission decision is made by the caller through
 * `Authorizer.forumIdsWhere`; this only arranges what it is given.
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
 * a forum three levels deep with no visible ancestors reads as top-level. They
 * are marked `isCategory` so the theme can render them as headings rather than
 * destinations.
 */

export interface ForumJumpRow {
  readonly id: number
  readonly parentId: number | null
  readonly displayOrder: number
  readonly type: string
  readonly title: string
  readonly slug: string
}

export interface ForumJumpInput {
  readonly rows: readonly ForumJumpRow[]
  readonly visibleForumIds: ReadonlySet<number>
  /** The forum being viewed, pre-selected. `null` off a forum page. */
  readonly currentForumId?: number | null
  /** Where the form submits. The app owns the URL, not the theme. */
  readonly action?: string
  /** The query-parameter name. The app owns this too. */
  readonly field?: string
}

export const JUMP_ACTION = '/jump'
export const JUMP_FIELD = 'forum'

export function buildForumJumpModel(input: ForumJumpInput): ForumJumpModel {
  const visible = keepVisibleSubtrees(input.rows, (row) => input.visibleForumIds.has(row.id))

  /*
   * Depth is computed from the tree rather than read from the stored `depth`
   * column. The column would in fact be right — `keepVisibleSubtrees` only keeps
   * a row whose ancestors all survived, so absolute and visible depth agree —
   * but that is a two-step argument resting on another function's invariant,
   * and the traversal already has the number in hand.
   */
  const forums: ForumJumpOption[] = []

  const walk = (node: ForumNode<ForumJumpRow>, depth: number): void => {
    forums.push({
      value: String(node.id),
      label: node.title,
      depth,
      isCategory: node.type === 'category',
      isSelected: node.id === (input.currentForumId ?? null),
    })
    for (const child of node.children) walk(child, depth + 1)
  }

  for (const root of buildTree(visible)) walk(root, 0)

  return {
    action: input.action ?? JUMP_ACTION,
    field: input.field ?? JUMP_FIELD,
    forums,
    submitLabel: 'Go',
    label: 'Jump to forum',
  }
}
