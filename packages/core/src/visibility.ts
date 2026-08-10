export const CONTENT_VISIBILITY = ['visible', 'unapproved', 'deleted'] as const
export type ContentVisibility = (typeof CONTENT_VISIBILITY)[number]

export interface ContentScope {
  readonly states: readonly ContentVisibility[]
  readonly seesUnapproved: boolean
  readonly seesDeleted: boolean
}

export const PUBLIC_CONTENT: ContentScope = {
  states: ['visible'],
  seesUnapproved: false,
  seesDeleted: false,
}

export function contentScopeFrom(options: {
  readonly seesUnapproved: boolean
  readonly seesDeleted: boolean
}): ContentScope {
  if (!options.seesUnapproved && !options.seesDeleted) return PUBLIC_CONTENT
  return {
    states: [
      'visible',
      ...(options.seesUnapproved ? (['unapproved'] as const) : []),
      ...(options.seesDeleted ? (['deleted'] as const) : []),
    ],
    seesUnapproved: options.seesUnapproved,
    seesDeleted: options.seesDeleted,
  }
}

export function isPublicScope(scope: ContentScope): boolean {
  return !scope.seesUnapproved && !scope.seesDeleted
}
