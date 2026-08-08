import { notFound, redirect } from 'next/navigation'

import { getContainer } from '@/server/container'
import { getActor } from '@/server/context'
import { memberHref } from '@/view/member-profile'

/**
 * `/member/by-name/<username>` — a name, resolved to the profile it names.
 *
 * This exists for one caller: the `@mention` link `@meith/markdown` renders
 * (`mentionHref`). Rendering is pure and its output is cached, so a mention
 * cannot embed a member *id* — the lookup happens here instead, when somebody
 * follows the link, and a rename between render and click still lands on the
 * right person as long as the name still names them.
 *
 * A name nobody holds is a 404, exactly like a profile id nobody holds — a
 * mention of a member who was deleted (or never existed: `@everyone` is just
 * prose) is a link to a page that honestly is not there.
 *
 * The `profile.view` gate is the same one `/member/[id]` applies, and matters
 * here for the same reason plus one: without it, this route would confirm to
 * somebody who may not view profiles which usernames exist.
 */
export default async function MemberByNamePage({
  params,
}: {
  params: Promise<{ name: string }>
}) {
  const raw = (await params).name

  /* The segment arrives percent-encoded; a malformed sequence names nobody. */
  let name: string
  try {
    name = decodeURIComponent(raw)
  } catch {
    notFound()
  }

  const actor = await getActor()
  const { authorizer, accountStore } = getContainer()
  if (!authorizer.can(actor, 'profile.view')) notFound()

  const { foldIdentifier } = await import('@meith/accounts')
  const account = await accountStore.accounts.findByUsernameLower(foldIdentifier(name))
  if (account === null) notFound()

  redirect(memberHref(account.id))
}
