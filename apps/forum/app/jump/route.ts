import { notFound, redirect } from 'next/navigation'
import type { NextRequest } from 'next/server'

import { getActor } from '@/server/context'
import { getContainer } from '@/server/container'
import { JUMP_FIELD } from '@/view/forum-jump'

/**
 * F27 — where the jump box submits.
 *
 * A GET route rather than a Server Action, because the jump box is a
 * `method="get"` form: a navigation is a URL, and a POST would break the back
 * button and make the destination unbookmarkable.
 *
 * ## It re-checks the permission
 *
 * The box only ever lists forums the viewer may see, so the obvious reading is
 * that this route can trust its input. It cannot, and the reason is the whole
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
export async function GET(request: NextRequest): Promise<Response> {
  const raw = request.nextUrl.searchParams.get(JUMP_FIELD)
  const forumId = raw !== null && /^\d+$/.test(raw) ? Number(raw) : null

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
