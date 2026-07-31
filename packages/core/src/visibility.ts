/**
 * F47 — the content-visibility scope, and the one rule about it.
 *
 * `visibility` is the most consequential column in the schema: every listing,
 * every count, every feed and every search result filters on it, and each of
 * those was writing its own predicate. That is the shape a leak takes — not a
 * missing check, but the twentieth read path added without one, or a check that
 * says `<> 'deleted'` where the others say `= 'visible'` and so lets the
 * moderation queue out to the public.
 *
 * So a viewer-facing read never names a visibility state. It is handed a
 * **scope** — the set of states this actor may see here — produced in exactly
 * one place (`Authorizer.contentScope`) and consumed in exactly one place
 * (`@forum/db`'s predicate helper). `pnpm guards` fails the build on any other
 * mention of the column in a read path.
 *
 * The type lives in `@forum/core` rather than in `@forum/authorization` because
 * it has to be *named* by both the package that decides it and the package that
 * turns it into SQL, and core is the floor both already stand on.
 */

/** R3.3's three states, mirroring the database enum. */
export const CONTENT_VISIBILITY = ['visible', 'unapproved', 'deleted'] as const
export type ContentVisibility = (typeof CONTENT_VISIBILITY)[number]

/**
 * What one actor may see, in one forum.
 *
 * `states` always contains `visible` and is the whole answer for a query. The
 * two booleans are the same answer for a view model — a page that needs to know
 * whether to offer a restore control should ask them rather than inspect the
 * array, so that adding a fourth state later does not silently change what an
 * `includes` call means.
 */
export interface ContentScope {
  readonly states: readonly ContentVisibility[]
  readonly seesUnapproved: boolean
  readonly seesDeleted: boolean
}

/**
 * The scope every actor has, before any permission widens it.
 *
 * Exported as a value so a read path that is *deliberately* public — validating
 * a mark-read target, resolving a post to quote — says so by naming this rather
 * than by writing `= 'visible'` and looking identical to a path that forgot.
 */
export const PUBLIC_CONTENT: ContentScope = {
  states: ['visible'],
  seesUnapproved: false,
  seesDeleted: false,
}

/** Build a scope from two already-made permission decisions. */
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

/** True when the scope admits nothing beyond what a guest sees. */
export function isPublicScope(scope: ContentScope): boolean {
  return !scope.seesUnapproved && !scope.seesDeleted
}
