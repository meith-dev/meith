import { buildTree, keepVisibleSubtrees, type ForumNode } from '@meith/forums'
import type { ForumJumpModel, ForumJumpOption } from '@meith/theme-kit'

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
  readonly currentForumId?: number | null
  readonly action?: string
  readonly field?: string
}

export const JUMP_ACTION = '/jump'
export const JUMP_FIELD = 'forum'

export function parseJumpTarget(raw: string | readonly string[] | undefined): number | null {
  const first = Array.isArray(raw) ? raw[0] : (raw as string | undefined)
  if (first === undefined || !/^\d+$/.test(first)) return null
  return Number(first)
}

export function buildForumJumpModel(input: ForumJumpInput): ForumJumpModel {
  const visible = keepVisibleSubtrees(input.rows, (row) => input.visibleForumIds.has(row.id))

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
