import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'

import { foldIdentifier } from '@meith/accounts'

import { getContainer } from '@/server/container'
import { getActor } from '@/server/context'
import { memberHref } from '@/view/member-profile'

export const metadata: Metadata = { title: 'Member profile' }

/**
 * `/member/by-name/<username>` — a profile reached by name instead of id.
 *
 * This exists for one caller: the mention link `@meith/markdown` renders. A
 * post's HTML is cached (`posts.message_html`), so the render cannot look a
 * name up at write time and must not need a database to be replayed — the link
 * therefore carries the name, and *this* route does the lookup at click time.
 * The same indirection the PM composer uses (`/messages/compose?to=`), for the
 * same reason: the name is what the author actually typed.
 *
 * A name nobody holds is a plain 404. That is not an oracle worth guarding
 * against — usernames are printed on every post — but `profile.view` is still
 * checked first, so a board that hides profiles from guests hides this door to
 * them too, with the same answer `/member/:id` gives.
 */
export default async function MemberByNamePage({
  params,
}: {
  params: Promise<{ name: string }>
}) {
  const raw = (await params).name
  /* The segment arrives percent-encoded; a name that will not decode is no name. */
  let name: string
  try {
    name = decodeURIComponent(raw)
  } catch {
    notFound()
  }

  const actor = await getActor()
  const { authorizer, accountStore } = getContainer()
  if (!authorizer.can(actor, 'profile.view')) notFound()

  const account = await accountStore.accounts.findByUsernameLower(foldIdentifier(name))
  if (account === null) notFound()

  redirect(memberHref(account.id))
}
