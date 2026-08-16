import type { ForumType } from './types'

export function canHoldThreads(type: ForumType): boolean {
  return type !== 'link'
}

export function canHoldForums(type: ForumType): boolean {
  return type !== 'link'
}

export function acceptsThreads(row: {
  readonly type: ForumType
  readonly allowThreads: boolean
}): boolean {
  return row.type === 'forum' || (row.type === 'category' && row.allowThreads)
}
