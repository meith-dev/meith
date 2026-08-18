import { ConflictError, ValidationError } from '@meith/core'
import { msg } from '@meith/i18n'

import type { ForumRow, NewForum } from './types'

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export interface CreatePlan {
  readonly parentId: number | null
  readonly parentPath: string | null
  readonly depth: number
  readonly displayOrder: number
}

export function planCreate(rows: readonly ForumRow[], input: NewForum): CreatePlan {
  const title = input.title.trim()
  if (title === '') throw new ValidationError(msg('error.forums.forum-needs-title'))

  if (!SLUG.test(input.slug)) {
    throw new ValidationError(
      `"${input.slug}" is not a valid slug: use lowercase letters, digits and single hyphens.`,
    )
  }

  if (input.type === 'link' && !input.linkUrl) {
    throw new ValidationError(msg('error.forums.link-forum-needs-linkurl'))
  }

  const parent = input.parentId === null ? null : rows.find((r) => r.id === input.parentId)
  if (input.parentId !== null && !parent) {
    throw new ValidationError(`No such parent forum: ${input.parentId}`)
  }

  if (parent?.type === 'link') {
    throw new ValidationError(`"${parent.title}" is a link and cannot contain forums.`)
  }

  const siblings = rows.filter((r) => r.parentId === input.parentId)
  if (siblings.some((s) => s.slug === input.slug)) {
    throw new ConflictError(
      `A forum with the slug "${input.slug}" already exists in that location.`,
    )
  }

  const parentPath = parent?.path ?? null

  return {
    parentId: input.parentId,
    parentPath,
    depth: parent === null || parent === undefined ? 0 : parent.depth + 1,
    displayOrder:
      input.displayOrder ?? siblings.reduce((max, s) => Math.max(max, s.displayOrder + 1), 0),
  }
}
