import { notFound, redirect } from 'next/navigation'

import { getActor } from '@/server/context'
import { getContainer } from '@/server/container'
import { JUMP_FIELD, parseJumpTarget } from '@/view/forum-jump'

/**
 * F27 — where the jump box submits.
 *
 * A GET destination rather than a Server Action, because the jump box is a
 * `method="get"` form: a navigation is a URL, and a POST would break the back
 * button and make the destination unbookmarkable.
 *
 * ## A page, not a route handler, and the reason is the 404
 *
 * This was `route.ts` until it was found to answer **404 with an empty body and
 * no `Content-Type`**. `notFound()` in a route handler has nothing to render
 * with — a route handler is not a React tree — so Next ends the response at the
 * status line. What a browser does with a bodiless error response is its own
 * business: Chromium ≥ 126 refuses the navigation outright with
 * `ERR_HTTP_RESPONSE_CODE_FAILURE`, so a member who typed a forum id got a
 * browser network error instead of the board saying no.
 *
 * A page is the whole fix. `notFound()` from here renders `app/not-found.tsx`,
 * which is the same 404 every unknown URL on the board already gets, and the
 * status is still 404 — so this stays an honest answer to a crawler rather than
 * becoming a redirect to an error page, which would be a soft 404.
 *
 * Nothing is ever rendered *from this file*: every branch redirects or 404s,
 * which is why it returns `never`.
 *
 * ## It re-checks the permission
 *
 * The box only ever lists forums the viewer may see, so the obvious reading is
 * that this page can trust its input. It cannot, and the reason is the whole
 * reason for the file: **the id arrives in a query string**, which anybody can
 * type. Building the redirect from a submitted id without re-authorising would
 * turn the jump box into an oracle — `/jump?forum=42` would reveal whether forum
 * 42 exists and what it is called, for every id, to anyone.
 *
 * So the check is the same one the box's own model was built from,
 * `forumIdsWhere(actor, 'forum.view')`, and an id outside it is a 404 rather
 * than a 403 — the same answer as an id that does not exist, which is what makes
 * it not an oracle.
 */
export default async function JumpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}): Promise<never> {
  const forumId = parseJumpTarget((await searchParams)[JUMP_FIELD])

  /*
   * No selection, or a malformed one, goes to the index. This is the one case
   * where a redirect rather than a 404 is right: it is what a member gets by
   * pressing "Go" without choosing anything, which is an accident rather than a
   * probe, and the index is where a jump box lives anyway.
   */
  if (forumId === null) redirect('/')

  const { authorizer, forums } = getContainer()
  const actor = await getActor()

  const visible = new Set(await authorizer.forumIdsWhere(actor, 'forum.view'))
  if (!visible.has(forumId)) notFound()

  const forum = await forums.findById(forumId)
  if (forum === null) notFound()

  /*
   * A category is not a destination — it has no page of its own — so jumping to
   * one lands on the index rather than 404ing. The box renders categories
   * disabled, so this only happens to somebody typing the URL.
   */
  if (forum.type === 'category') redirect('/')

  redirect(`/forum/${forum.id}-${forum.slug}`)
}
